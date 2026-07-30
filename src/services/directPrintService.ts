import { Sale } from '../types';
import { ShopDetails, DataService } from './dataService';
import { safeLocalStorage, safeSessionStorage } from '@/utils/safeStorage';

const localStorage = safeLocalStorage;
const sessionStorage = safeSessionStorage;

let activeUSBDevice: USBDevice | null = null;
let activeSerialPort: any = null; // SerialPort is not globally typed in standard TS without dom-webcodecs
let activeSerialWriter: any = null;
let activeBluetoothDevice: any = null;
let activeBluetoothCharacteristic: any = null;

// Track active printer name in state
let connectedPrinterName = '';

/**
 * Clean up active connections
 */
const closeConnections = async () => {
  try {
    if (activeSerialWriter) {
      activeSerialWriter.releaseLock();
      activeSerialWriter = null;
    }
    if (activeSerialPort) {
      await activeSerialPort.close();
      activeSerialPort = null;
    }
    if (activeUSBDevice) {
      await activeUSBDevice.close();
      activeUSBDevice = null;
    }
    if (activeBluetoothDevice) {
      if (activeBluetoothDevice.gatt?.connected) {
        await activeBluetoothDevice.gatt.disconnect();
      }
      activeBluetoothDevice = null;
      activeBluetoothCharacteristic = null;
    }
  } catch (err) {
    console.warn('[DirectPrint] Error closing connections:', err);
  }
  connectedPrinterName = '';
};

/**
 * Find the printer class (7) or first bulk OUT endpoint on a USB device
 */
const findUSBEndpoint = (device: USBDevice) => {
  let interfaceNumber = 0;
  let endpointNumber = 0;
  let found = false;

  // 1. Look for Printer Class (7)
  for (const conf of device.configurations) {
    for (const intf of conf.interfaces) {
      for (const alt of intf.alternates) {
        if (alt.interfaceClass === 7) {
          interfaceNumber = intf.interfaceNumber;
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out') {
              endpointNumber = ep.endpointNumber;
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (found) break;
  }

  // 2. Fallback to any OUT bulk endpoint
  if (!found) {
    for (const conf of device.configurations) {
      for (const intf of conf.interfaces) {
        for (const alt of intf.alternates) {
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out') {
              interfaceNumber = intf.interfaceNumber;
              endpointNumber = ep.endpointNumber;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) break;
    }
  }

  return { interfaceNumber, endpointNumber, found };
};

export const DirectPrintService = {
  /**
   * Check if any direct printer is connected
   */
  isPrinterConnected(): boolean {
    const isEnabled = localStorage.getItem('retailpro_direct_print_enabled') === 'true';
    return isEnabled && (!!activeUSBDevice || !!activeSerialPort || !!activeBluetoothDevice);
  },

  /**
   * Get connected printer description
   */
  getConnectedPrinterName(): string {
    if (!this.isPrinterConnected()) return '';
    const type = localStorage.getItem('retailpro_direct_print_type') || 'USB';
    return connectedPrinterName || `${type.toUpperCase()} Printer`;
  },

  /**
   * Disconnect any paired direct printer
   */
  async disconnect(): Promise<void> {
    await closeConnections();
    localStorage.setItem('retailpro_direct_print_enabled', 'false');
    localStorage.removeItem('retailpro_direct_print_type');
    localStorage.removeItem('retailpro_direct_print_usb_vendor');
    localStorage.removeItem('retailpro_direct_print_usb_product');
    localStorage.removeItem('retailpro_direct_print_bt_name');
  },

  /**
   * Connect to a USB Thermal Printer using WebUSB
   */
  async connectUSB(): Promise<{ success: boolean; name: string; error?: string }> {
    if (!('usb' in navigator)) {
      return { success: false, name: '', error: 'WebUSB is not supported in this browser. Please use Google Chrome or Microsoft Edge.' };
    }

    try {
      await closeConnections();
      
      const device = await navigator.usb.requestDevice({ filters: [] });
      await device.open();
      
      // Select configuration
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      const { interfaceNumber, found } = findUSBEndpoint(device);
      if (!found) {
        throw new Error('No OUT bulk endpoint found on this USB device. It might not be a thermal printer.');
      }

      await device.claimInterface(interfaceNumber);
      
      activeUSBDevice = device;
      connectedPrinterName = device.productName || `USB Printer (${device.vendorId.toString(16)}:${device.productId.toString(16)})`;
      
      // Save details to localStorage for auto-connection
      localStorage.setItem('retailpro_direct_print_enabled', 'true');
      localStorage.setItem('retailpro_direct_print_type', 'usb');
      localStorage.setItem('retailpro_direct_print_usb_vendor', device.vendorId.toString());
      localStorage.setItem('retailpro_direct_print_usb_product', device.productId.toString());

      console.log('[DirectPrint] Successfully claimed USB printer:', connectedPrinterName);
      return { success: true, name: connectedPrinterName };
    } catch (err: any) {
      console.error('[DirectPrint] WebUSB connect error:', err);
      return { success: false, name: '', error: err.message || 'Connection failed.' };
    }
  },

  /**
   * Connect to a Serial Port Printer using Web Serial
   */
  async connectSerial(): Promise<{ success: boolean; name: string; error?: string }> {
    if (!('serial' in navigator)) {
      return { success: false, name: '', error: 'Web Serial is not supported in this browser. Please use Google Chrome or Microsoft Edge.' };
    }

    try {
      await closeConnections();

      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      
      activeSerialPort = port;
      activeSerialWriter = port.writable.getWriter();
      connectedPrinterName = 'Serial COM Printer';

      localStorage.setItem('retailpro_direct_print_enabled', 'true');
      localStorage.setItem('retailpro_direct_print_type', 'serial');

      console.log('[DirectPrint] Successfully opened Serial port printer.');
      return { success: true, name: connectedPrinterName };
    } catch (err: any) {
      console.error('[DirectPrint] Web Serial connect error:', err);
      return { success: false, name: '', error: err.message || 'Connection failed.' };
    }
  },

  /**
   * Connect to a Bluetooth Thermal Printer using Web Bluetooth
   */
  async connectBluetooth(): Promise<{ success: boolean; name: string; error?: string }> {
    if (!('bluetooth' in navigator)) {
      return { success: false, name: '', error: 'Web Bluetooth is not supported on this device/browser. Please use Chrome/Android WebView.' };
    }

    try {
      await closeConnections();
      
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['00001101-0000-1000-8000-00805f9b34fb', '000018f0-0000-1000-8000-00805f9b34fb']
      });

      const server = await device.gatt.connect();
      
      // Look for SPP or Printer service
      let service;
      try {
        service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        try {
          service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        } catch (e2) {
          const services = await server.getPrimaryServices();
          if (services.length > 0) service = services[0];
        }
      }

      if (!service) {
        throw new Error('No compatible service found on this Bluetooth device.');
      }

      const characteristics = await service.getCharacteristics();
      const writeChar = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);

      if (!writeChar) {
        throw new Error('No write characteristic found on this device.');
      }

      activeBluetoothDevice = device;
      activeBluetoothCharacteristic = writeChar;
      connectedPrinterName = device.name || 'Bluetooth Printer';

      localStorage.setItem('retailpro_direct_print_enabled', 'true');
      localStorage.setItem('retailpro_direct_print_type', 'bluetooth');
      localStorage.setItem('retailpro_direct_print_bt_name', connectedPrinterName);

      console.log('[DirectPrint] Successfully connected to Bluetooth printer:', connectedPrinterName);
      return { success: true, name: connectedPrinterName };
    } catch (err: any) {
      console.error('[DirectPrint] Web Bluetooth connect error:', err);
      return { success: false, name: '', error: err.message || 'Connection failed.' };
    }
  },

  /**
   * Attempt auto-connection to previously paired USB device on load
   */
  async autoConnect(): Promise<boolean> {
    const isEnabled = localStorage.getItem('retailpro_direct_print_enabled') === 'true';
    const type = localStorage.getItem('retailpro_direct_print_type');
    
    if (!isEnabled || !type) return false;

    try {
      if (type === 'usb' && 'usb' in navigator) {
        const vendorStr = localStorage.getItem('retailpro_direct_print_usb_vendor');
        const productStr = localStorage.getItem('retailpro_direct_print_usb_product');
        if (!vendorStr || !productStr) return false;

        const vendorId = parseInt(vendorStr);
        const productId = parseInt(productStr);

        const devices = await navigator.usb.getDevices();
        const matched = devices.find(d => d.vendorId === vendorId && d.productId === productId);

        if (matched) {
          await matched.open();
          if (matched.configuration === null) {
            await matched.selectConfiguration(1);
          }
          const { interfaceNumber } = findUSBEndpoint(matched);
          await matched.claimInterface(interfaceNumber);
          activeUSBDevice = matched;
          connectedPrinterName = matched.productName || `USB Printer (${matched.vendorId.toString(16)}:${matched.productId.toString(16)})`;
          console.log('[DirectPrint] Auto-connected USB printer:', connectedPrinterName);
          return true;
        }
      }
      // Bluetooth and Serial need user gesture normally, so we don't fully auto-connect on bare load, but we keep the connection name
      if (type === 'bluetooth') {
        connectedPrinterName = localStorage.getItem('retailpro_direct_print_bt_name') || 'Bluetooth Printer';
        return true;
      }
    } catch (err) {
      console.warn('[DirectPrint] Auto-connect failed:', err);
    }
    return false;
  },

  /**
   * Write binary data to the claimed printer
   */
  async writeRaw(data: Uint8Array): Promise<void> {
    const type = localStorage.getItem('retailpro_direct_print_type');
    
    if (type === 'usb' && activeUSBDevice) {
      const { endpointNumber } = findUSBEndpoint(activeUSBDevice);
      const result = await activeUSBDevice.transferOut(endpointNumber, data);
      if (result.status !== 'ok') {
        throw new Error(`USB Transfer failed: ${result.status}`);
      }
    } else if (type === 'serial' && activeSerialWriter) {
      await activeSerialWriter.write(data);
    } else if (type === 'bluetooth' && activeBluetoothCharacteristic) {
      // Chunk BLE writes to avoid overflowing MTU limits
      const chunkSize = 20;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await activeBluetoothCharacteristic.writeValue(chunk);
      }
    } else {
      throw new Error('Printer is not connected or initialized.');
    }
  },

  /**
   * Format and print a POS Sale Receipt
   */
  async printReceiptDirect(sale: Sale, shopDetails: ShopDetails | null | undefined): Promise<void> {
    if (!this.isPrinterConnected()) {
      throw new Error('No physical thermal printer is connected. Connect one in Settings.');
    }

    try {
      const bytes: number[] = [];
      const enc = new TextEncoder();

      // Helper to add bytes
      const add = (arr: number[]) => bytes.push(...arr);
      const addText = (text: string) => bytes.push(...enc.encode(text));
      const addNewLine = () => bytes.push(0x0A);

      // 1. Initialize printer
      add([0x1B, 0x40]); // ESC @ (Initialize)
      
      // 2. Header
      add([0x1B, 0x61, 0x01]); // ESC a 1 (Center Alignment)
      add([0x1D, 0x21, 0x11]); // GS ! 17 (Double width, double height font)
      add([0x1B, 0x45, 0x01]); // ESC E 1 (Bold on)
      addText(shopDetails?.name || 'BILL');
      addNewLine();
      
      add([0x1D, 0x21, 0x00]); // Reset font size
      add([0x1B, 0x45, 0x00]); // Bold off
      
      if (shopDetails?.address) {
        addText(shopDetails.address);
        addNewLine();
      }
      if (shopDetails?.phone) {
        addText(`Tel: ${shopDetails.phone}`);
        addNewLine();
      }
      addNewLine();

      // 3. Bill details (Left alignment)
      add([0x1B, 0x61, 0x00]); // ESC a 0 (Left Alignment)
      addText(`Bill No:   ${sale.invoiceNumber}`); addNewLine();
      
      const dateObj = new Date(sale.createdAt || Date.now());
      const dateStr = dateObj.toLocaleDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      addText(`Date:      ${dateStr}`); addNewLine();
      addText(`Time:      ${timeStr}`); addNewLine();
      addText(`Cashier:   ${sale.cashierId || 'Cashier'}`); addNewLine();
      if (sale.customerPhone) {
        addText(`Customer:  ${sale.customerPhone}`); addNewLine();
      }
      
      // 4. Divider
      const paperSize = shopDetails?.paperSize || '80mm';
      const is80 = paperSize === '80mm';
      const widthChars = is80 ? 48 : 32;
      const lineChar = '-';
      addText(lineChar.repeat(widthChars)); addNewLine();

      // 5. Items Header
      // Width allocation:
      // 58mm (32 chars): ITEM (15) QTY (5) TOTAL (12)
      // 80mm (48 chars): ITEM (25) QTY (8) TOTAL (15)
      add([0x1B, 0x45, 0x01]); // Bold on
      if (is80) {
        addText('ITEM'.padEnd(25) + 'QTY'.padStart(8) + 'TOTAL'.padStart(15));
      } else {
        addText('ITEM'.padEnd(15) + 'QTY'.padStart(5) + 'TOTAL'.padStart(12));
      }
      addNewLine();
      add([0x1B, 0x45, 0x00]); // Bold off
      addText(lineChar.repeat(widthChars)); addNewLine();

      // 6. Items
      sale.items.forEach(item => {
        const name = item.name.substring(0, is80 ? 24 : 14);
        const qty = item.quantity.toString();
        const total = `₹${(item.sellingPrice * item.quantity).toFixed(2)}`;
        
        if (is80) {
          addText(name.padEnd(25) + qty.padStart(8) + total.padStart(15));
        } else {
          addText(name.padEnd(15) + qty.padStart(5) + total.padStart(12));
        }
        addNewLine();
      });
      addText(lineChar.repeat(widthChars)); addNewLine();

      // 7. Totals (Right alignment)
      add([0x1B, 0x61, 0x02]); // ESC a 2 (Right Alignment)
      
      addText(`Subtotal: ₹${(sale.subtotal || 0).toFixed(2)}`); addNewLine();
      if (sale.taxTotal > 0) {
        addText(`GST: ₹${sale.taxTotal.toFixed(2)}`); addNewLine();
      }
      
      // Grand Total Double Size
      add([0x1D, 0x21, 0x10]); // GS ! 16 (Double height font)
      add([0x1B, 0x45, 0x01]); // Bold on
      addText(`GRAND TOTAL: ₹${sale.grandTotal.toFixed(2)}`); addNewLine();
      add([0x1D, 0x21, 0x00]); // Reset font size
      add([0x1B, 0x45, 0x00]); // Bold off
      addNewLine();

      // Payment info
      add([0x1B, 0x61, 0x00]); // Left Alignment
      addText(`Payment Mode: ${(sale.paymentMode || 'CASH').toUpperCase()}`); addNewLine();
      if (sale.cashReceived !== undefined) {
        addText(`Cash Received: ₹${sale.cashReceived.toFixed(2)}`); addNewLine();
        addText(`Change Due:    ₹${(sale.changeDue || 0).toFixed(2)}`); addNewLine();
      }
      
      add([0x1B, 0x61, 0x01]); // Center Alignment
      addText(lineChar.repeat(widthChars)); addNewLine();
      
      // Footer
      add([0x1B, 0x45, 0x01]); // Bold on
      addText('THANK YOU FOR SHOPPING!');
      addNewLine();
      add([0x1B, 0x45, 0x00]); // Bold off
      addText('Items once sold cannot be returned.'); addNewLine();
      addText('POWERED BY DO BILL'); addNewLine();

      // Feed paper & Cut
      add([0x1B, 0x64, 0x05]); // Feed 5 lines
      add([0x1D, 0x56, 0x41, 0x00]); // GS V 65 0 (Paper Cut with feed)

      // Send raw data
      await this.writeRaw(new Uint8Array(bytes));
    } catch (err: any) {
      console.error('[DirectPrint] Error printing receipt:', err);
      throw new Error(`Physical printing failed: ${err.message || err}`);
    }
  },

  /**
   * Format and print a Barcode Label
   */
  async printBarcodeDirect(
    productName: string,
    barcode: string,
    price: number,
    brand: string,
    quantity: number
  ): Promise<void> {
    if (!this.isPrinterConnected()) {
      throw new Error('No physical thermal printer is connected. Connect one in Settings.');
    }

    try {
      const bytes: number[] = [];
      const enc = new TextEncoder();

      const add = (arr: number[]) => bytes.push(...arr);
      const addText = (text: string) => bytes.push(...enc.encode(text));
      const addNewLine = () => bytes.push(0x0A);

      // Print specified quantity of labels
      for (let q = 0; q < quantity; q++) {
        // Initialize
        add([0x1B, 0x40]);
        
        // Center alignment
        add([0x1B, 0x61, 0x01]);

        // 1. Brand name (small, bold)
        if (brand) {
          add([0x1B, 0x45, 0x01]);
          addText(brand.toUpperCase());
          add([0x1B, 0x45, 0x00]);
          addNewLine();
        }

        // 2. Product Name
        add([0x1B, 0x45, 0x01]);
        addText(productName.substring(0, 24));
        add([0x1B, 0x45, 0x00]);
        addNewLine();

        // 3. Native ESC/POS Barcode print
        // Barcode height (default is 162 dots, let's use 60 dots = 7.5mm for compactness)
        add([0x1D, 0x68, 60]);
        // Barcode width (2 dots per module is standard and works on most printers)
        add([0x1D, 0x77, 2]);
        // Position of HRI characters (2 = below barcode)
        add([0x1D, 0x66, 2]);

        // Print barcode command (CODE39 is extremely compatible and easy)
        // CODE39 system B: GS k 69 n d1...dn
        // Let's filter barcode to alphanumeric uppercase as CODE39 expects
        const cleanBarcode = barcode.toUpperCase().replace(/[^A-Z0-9\-\.\ \$\/\+\%]/g, '');
        if (cleanBarcode) {
          add([0x1D, 0x6B, 69, cleanBarcode.length]);
          addText(cleanBarcode);
        } else {
          // Fallback to text if barcode string has weird chars
          addText(`*${barcode}*`);
          addNewLine();
        }
        addNewLine();

        // 4. Price (Bold, Double size)
        add([0x1D, 0x21, 0x11]); // Double width & height
        add([0x1B, 0x45, 0x01]);
        addText(`Rs. ${price.toFixed(2)}`);
        add([0x1D, 0x21, 0x00]);
        add([0x1B, 0x45, 0x00]);
        addNewLine();

        // Feed some lines to make room between labels & partially cut if supported
        add([0x1B, 0x64, 0x03]); // Feed 3 lines
        add([0x1D, 0x56, 0x42, 0x00]); // GS V 66 0 (Paper partial cut)
      }

      await this.writeRaw(new Uint8Array(bytes));
    } catch (err: any) {
      console.error('[DirectPrint] Error printing barcode:', err);
      throw new Error(`Physical barcode printing failed: ${err.message || err}`);
    }
  },

  /**
   * Send a beautiful test pattern to the claimed printer
   */
  async testPrintDirect(): Promise<void> {
    if (!this.isPrinterConnected()) {
      throw new Error('No physical thermal printer is connected. Connect one in Settings.');
    }

    try {
      const bytes: number[] = [];
      const enc = new TextEncoder();
      const add = (arr: number[]) => bytes.push(...arr);
      const addText = (text: string) => bytes.push(...enc.encode(text));
      const addNewLine = () => bytes.push(0x0A);

      // Initialize
      add([0x1B, 0x40]);
      
      // Center title
      add([0x1B, 0x61, 0x01]);
      add([0x1D, 0x21, 0x11]);
      add([0x1B, 0x45, 0x01]);
      addText('DO BILL POS');
      addNewLine();
      add([0x1D, 0x21, 0x00]);
      add([0x1B, 0x45, 0x00]);
      
      addText('DIRECT THERMAL PRINTER TEST');
      addNewLine();
      addText('--------------------------------');
      addNewLine();
      
      // Left align body
      add([0x1B, 0x61, 0x00]);
      addText('Printer Status:   ONLINE / READY'); addNewLine();
      addText(`Connection:       ${localStorage.getItem('retailpro_direct_print_type')?.toUpperCase()}`); addNewLine();
      addText(`Timestamp:        ${new Date().toLocaleString()}`); addNewLine();
      addText('--------------------------------'); addNewLine();
      
      // Test fonts & styles
      add([0x1B, 0x45, 0x01]);
      addText('This text is BOLD.'); addNewLine();
      add([0x1B, 0x45, 0x00]);
      
      add([0x1D, 0x21, 0x10]); // Double height
      addText('Double Height Font'); addNewLine();
      add([0x1D, 0x21, 0x00]);
      
      add([0x1D, 0x21, 0x01]); // Double width
      addText('Double Width Font'); addNewLine();
      add([0x1D, 0x21, 0x00]);
      
      addText('--------------------------------'); addNewLine();
      
      // Print a test barcode
      add([0x1B, 0x61, 0x01]); // Center
      addText('TEST BARCODE:'); addNewLine();
      add([0x1D, 0x68, 60]); // Height
      add([0x1D, 0x77, 2]);  // Width
      add([0x1D, 0x66, 2]);  // Text below
      add([0x1D, 0x6B, 69, 10]); // CODE39 System B length 10
      addText('DOBILL1234');
      addNewLine();
      
      addText('--------------------------------'); addNewLine();
      add([0x1B, 0x45, 0x01]);
      addText('TEST COMPLETED SUCCESSFULLY!');
      addNewLine();
      add([0x1B, 0x45, 0x00]);
      addText('Thank you for using Do Bill.'); addNewLine();

      // Feed & Cut
      add([0x1B, 0x64, 0x05]);
      add([0x1D, 0x56, 0x41, 0x00]);

      await this.writeRaw(new Uint8Array(bytes));
    } catch (err: any) {
      console.error('[DirectPrint] Test print error:', err);
      throw new Error(`Test print failed: ${err.message || err}`);
    }
  }
};

export function buildReceiptHTML(sale: Sale, shopDetails?: ShopDetails | null, userProfile?: any): string {
  const shopName = shopDetails?.name || 'STORE RECEIPT';
  const shopAddress = shopDetails?.address || '';
  const shopPhone = shopDetails?.phone || '';
  const is80 = (shopDetails?.paperSize || '80mm') === '80mm';
  const paperVal = is80 ? '80mm' : '58mm';
  const widthVal = is80 ? '72mm' : '52mm';

  const customerRows = [];
  if (sale.customerName) {
    customerRows.push(`
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5mm;">
        <span style="font-weight: bold;">Customer:</span>
        <span style="font-weight: 900; text-transform: uppercase;">${sale.customerName}</span>
      </div>
    `);
  }
  if (sale.customerPhone) {
    customerRows.push(`
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5mm;">
        <span style="font-weight: bold;">Phone:</span>
        <span>${sale.customerPhone}</span>
      </div>
    `);
  }
  if (sale.customerAddress) {
    customerRows.push(`
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5mm;">
        <span style="font-weight: bold;">Address:</span>
        <span style="text-align: right; max-width: 60%; word-break: break-all;">${sale.customerAddress}</span>
      </div>
    `);
  }

  const itemsRows = (sale.items || []).map(item => `
    <tr style="border-bottom: 1px dashed #e2e8f0;">
      <td style="padding: 1.5mm 0; text-align: left;">
        <div style="font-weight: 900; line-height: 1.1; font-size: 11px;">${item.name}</div>
        <div style="font-size: 9px; color: #475569; margin-top: 0.2mm;">@₹${item.sellingPrice.toFixed(2)}</div>
      </td>
      <td style="text-align: center; padding: 1.5mm 0; font-weight: bold;">${item.quantity}</td>
      <td style="text-align: right; padding: 1.5mm 0; font-weight: bold;">₹${(item.sellingPrice * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  const changeRows = sale.paymentMode === 'cash' ? `
    <div style="display: flex; justify-content: space-between; margin-top: 0.5mm;">
      <span>Paid:</span>
      <span>₹${(sale.cashReceived || 0).toFixed(2)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; margin-top: 0.5mm; font-weight: bold;">
      <span>Change:</span>
      <span>₹${(sale.changeDue || 0).toFixed(2)}</span>
    </div>
  ` : '';

  return `
    <style>
      @media print {
        @page {
          margin: 0 !important;
          size: ${paperVal} auto !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${paperVal} !important;
          background: white !important;
        }
        .thermal-receipt {
          width: ${widthVal} !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 1mm 1mm 2mm 1mm !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
      }
    </style>
    <div class="thermal-receipt" style="width: ${widthVal}; margin: 0 auto; color: black; background: white; font-family: 'Courier New', Courier, monospace; font-size: 11px; padding: 1mm 1mm 2mm 1mm; page-break-inside: avoid; break-inside: avoid;">
      <div class="receipt-header" style="text-align: center; margin-bottom: 2mm; page-break-inside: avoid; break-inside: avoid;">
        ${shopDetails?.logo ? `
          <div style="text-align: center; margin-bottom: 2mm;">
            <img src="${shopDetails.logo}" style="height: 14mm; width: 14mm; border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0; display: inline-block;" />
          </div>
        ` : ''}
        <h1 class="shop-name" style="font-size: 16px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">${shopName}</h1>
        ${shopAddress ? `<p class="shop-detail" style="font-size: 10px; margin: 0; line-height: 1.1;">${shopAddress}</p>` : ''}
        ${shopPhone ? `<p class="shop-detail font-bold" style="font-size: 10px; margin: 0; line-height: 1.1; font-weight: bold;">Tel: ${shopPhone}</p>` : ''}
      </div>
      
      <div class="receipt-sep" style="border-top: 1px dashed black; margin: 2mm 0; width: 100%;"></div>
      
      <div class="receipt-info-grid" style="font-size: 10px; margin-bottom: 2mm; width: 100%; font-weight: 600; page-break-inside: avoid; break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5mm;">
          <span>Bill No:</span>
          <span style="font-weight: bold;">${sale.invoiceNumber}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5mm;">
          <span>Date:</span>
          <span>${new Date(sale.createdAt).toLocaleDateString('en-IN')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5mm;">
          <span>Time:</span>
          <span>${new Date(sale.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5mm;">
          <span>Cashier:</span>
          <span style="font-weight: bold; text-transform: uppercase;">${userProfile?.name || 'Do Bill Cashier'}</span>
        </div>
        ${customerRows.join('')}
      </div>
      
      <div class="receipt-sep" style="border-top: 1px dashed black; margin: 2mm 0; width: 100%;"></div>
      
      <table class="receipt-table" style="width: 100%; border-collapse: collapse; font-size: 10px; margin: 1mm 0; page-break-inside: avoid; break-inside: avoid;">
        <thead>
          <tr style="border-bottom: 1.5px solid black;">
            <th style="text-align: left; padding: 1.5mm 0; font-weight: 700; text-transform: uppercase;">ITEM</th>
            <th style="text-align: center; padding: 1.5mm 0; font-weight: 700; text-transform: uppercase; width: 20%;">QTY</th>
            <th style="text-align: right; padding: 1.5mm 0; font-weight: 700; text-transform: uppercase; width: 30%;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
      
      <div class="receipt-sep" style="border-top: 1px dashed black; margin: 2mm 0; width: 100%;"></div>
      
      <div class="totals-area" style="font-size: 11px; padding: 1mm 0; font-weight: 700; page-break-inside: avoid; break-inside: avoid;">
        <div style="display: flex; justify-content: space-between;">
          <span>Subtotal:</span>
          <span>₹${sale.subtotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>GST (Tax):</span>
          <span>₹${sale.taxTotal.toFixed(2)}</span>
        </div>
        <div class="grand-total-row justify-between flex" style="font-size: 15px; font-weight: 900; border-top: 1.5px solid black; border-bottom: 1.5px solid black; margin-top: 1mm; padding: 1.5mm 0; display: flex; justify-content: space-between;">
          <span>GRAND TOTAL</span>
          <span>₹${sale.grandTotal.toFixed(2)}</span>
        </div>
      </div>
      
      <div class="receipt-sep" style="border-top: 1px dashed black; margin: 2mm 0; width: 100%;"></div>
      
      <div class="payment-info" style="font-size: 10px; margin-top: 1.5mm; font-weight: 600; page-break-inside: avoid; break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; text-transform: uppercase;">
          <span>Mode:</span>
          <span style="font-weight: 900;">${sale.paymentMode}</span>
        </div>
        ${changeRows}
      </div>
      
      <div class="receipt-sep" style="border-top: 1px dashed black; margin: 2mm 0; width: 100%;"></div>
      
      <div class="receipt-footer" style="text-align: center; margin-top: 2mm; font-size: 9px; padding-bottom: 1mm; page-break-inside: avoid; break-inside: avoid;">
        <p style="font-weight: 900; font-size: 11px; margin-bottom: 0.5mm;">THANK YOU FOR SHOPPING!</p>
        <p style="font-size: 8px; margin-top: 1mm; font-weight: bold;">Items once sold cannot be returned.</p>
        <p style="font-size: 8px; margin-top: 2mm; border-top: 1px solid black; padding-top: 1mm; font-weight: bold;">POWERED BY DO BILL</p>
      </div>
    </div>
  `;
}

/**
 * Universal print function that works on web and inside Capacitor APK
 */
/**
 * Universal print function that works on Web, Android WebView, Capacitor APK, and Desktop
 */
export const universalPrintHTML = async (htmlContent: string): Promise<{ success: boolean; message: string }> => {
  // Fallback 1: Hidden Iframe Printing (Works in almost all Mobile/Android WebViews and browsers)
  try {
    const iframe = document.createElement('iframe');
    iframe.id = 'dobill-universal-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      await new Promise((res) => setTimeout(res, 400));

      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();

      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 3000);

      return { success: true, message: "Print Command Sent" };
    }
  } catch (iframeErr) {
    console.warn('[DirectPrint] Iframe print failed, trying overlay print:', iframeErr);
  }

  // Fallback 2: Document Overlay Printing
  try {
    const printContainer = document.createElement('div');
    printContainer.id = 'dobill-universal-print-container';
    printContainer.className = 'barcode-print-overlay';
    printContainer.style.position = 'absolute';
    printContainer.style.left = '0';
    printContainer.style.top = '0';
    printContainer.style.width = '100%';
    printContainer.style.zIndex = '99999';
    printContainer.style.background = 'white';
    printContainer.innerHTML = htmlContent;

    const style = document.createElement('style');
    style.id = 'dobill-universal-print-style';
    style.innerHTML = `
      @media print {
        #root, .no-print, body > *:not(#dobill-universal-print-container) { display: none !important; }
        #dobill-universal-print-container { display: block !important; width: 100% !important; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(printContainer);

    window.print();

    setTimeout(() => {
      if (document.body.contains(printContainer)) document.body.removeChild(printContainer);
      if (document.head.contains(style)) document.head.removeChild(style);
    }, 2000);

    return { success: true, message: "Print Triggered" };
  } catch (windowErr: any) {
    return { success: false, message: `Print failed: ${windowErr.message || windowErr}` };
  }
};

/**
 * Open HTML print sheet in a new browser window/tab (Ideal for APKs or Mobile Browsers)
 */
export const openInNewPrintWindow = (htmlContent: string) => {
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  const printWindow = window.open(blobUrl, '_blank');
  
  if (!printWindow) {
    // If popup blocked, navigate to blob or alert
    window.location.href = blobUrl;
    return;
  }

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };
};

/**
 * Download HTML Barcode sheet for Android print apps like RawBT or Thermal Print Service
 */
export const downloadPrintableHTML = (htmlContent: string, fileName: string = 'barcode-labels.html') => {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const handlePrint = async (sale: Sale): Promise<{ success: boolean; message: string }> => {
  // 1. Fetch shopDetails and userProfile automatically
  let shopDetails: ShopDetails | null = null;
  let userProfile: any = null;
  try {
    shopDetails = await DataService.getShopDetails();
    userProfile = await DataService.getUserProfile();
  } catch (err) {
    console.warn("[DirectPrint] Failed to preload metadata:", err);
  }

  // 2. Platform Detection
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
  const isAndroid = typeof window !== 'undefined' && (
    !!(window as any).Capacitor || 
    window.location.protocol === 'capacitor:' || 
    /android/i.test(navigator.userAgent)
  );

  if (isElectron) {
    // 3. Electron - Silent Native Thermal Print
    try {
      const printers = await (window as any).electronAPI.getPrinters();
      if (!printers || printers.length === 0) {
        return { success: false, message: "Printer Not Connected" };
      }
      const htmlContent = buildReceiptHTML(sale, shopDetails, userProfile);
      await (window as any).electronAPI.printSilent(htmlContent);
      return { success: true, message: "Print Successful" };
    } catch (err: any) {
      console.error('[DirectPrint] Electron print error:', err);
      return { success: false, message: "Printer Not Connected" };
    }
  } else if (isAndroid) {
    // 4. Android (Capacitor) - direct printing via Bluetooth/USB/Serial
    if (DirectPrintService.isPrinterConnected()) {
      try {
        await DirectPrintService.printReceiptDirect(sale, shopDetails);
        return { success: true, message: "Print Successful" };
      } catch (err: any) {
        console.error('[DirectPrint] Android physical print error:', err);
      }
    }

    // Fallback: Trigger Native Android Print Manager
    const isCapacitorNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() === true;
    if (isCapacitorNative) {
      try {
        const is80 = (shopDetails?.paperSize || '80mm') === '80mm';
        const paperWidth = is80 ? '80mm' : '58mm';
        const printableWidth = is80 ? '72mm' : '52mm';

        const fullHTML = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                @media print, screen {
                  @page {
                    margin: 0 !important;
                    size: ${paperWidth} auto !important;
                  }
                  html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    width: ${paperWidth} !important;
                    background: white !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color: black !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                  }
                  .thermal-receipt {
                    width: ${printableWidth} !important;
                    max-width: ${printableWidth} !important;
                    margin: 0 auto !important;
                    padding: 1mm 1mm 2mm 1mm !important;
                    box-sizing: border-box !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                  }
                }
              </style>
            </head>
            <body>
              <div class="thermal-receipt">
                ${buildReceiptHTML(sale, shopDetails, userProfile)}
              </div>
            </body>
          </html>
        `;
        return await universalPrintHTML(fullHTML);
      } catch (err: any) {
        console.error('[DirectPrint] Capacitor print fallback error:', err);
        return { success: false, message: `Native Print failed: ${err.message || err}` };
      }
    } else {
      return { success: false, message: "Printer Not Connected" };
    }
  } else {
    // 5. Web fallback
    if (DirectPrintService.isPrinterConnected()) {
      try {
        await DirectPrintService.printReceiptDirect(sale, shopDetails);
        return { success: true, message: "Print Successful" };
      } catch (err: any) {
        console.warn('[DirectPrint] Web physical print failed, falling back to browser print:', err);
      }
    }

    // Fallback to Web Browser Printing Dialogue using the common template
    return new Promise<{ success: boolean; message: string }>((resolve) => {
      const is80 = (shopDetails?.paperSize || '80mm') === '80mm';
      const paperWidth = is80 ? '80mm' : '58mm';
      const printableWidth = is80 ? '72mm' : '52mm';

      const printStyle = document.createElement('style');
      printStyle.id = 'dobill-dynamic-pos-print-style';
      printStyle.innerHTML = `
        @media print {
          @page {
            margin: 0 !important;
            size: ${paperWidth} auto !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: ${paperWidth} !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color: black !important;
          }
          #root, .no-print {
            display: none !important;
          }
          .print-container-overlay {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth} !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .thermal-receipt {
            width: ${printableWidth} !important;
            max-width: ${printableWidth} !important;
            margin: 0 auto !important;
            padding: 1mm 1mm 2mm 1mm !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `;
      document.head.appendChild(printStyle);

      const htmlContent = buildReceiptHTML(sale, shopDetails, userProfile);
      const printContainer = document.createElement('div');
      printContainer.className = 'print-container-overlay';
      printContainer.innerHTML = htmlContent;
      document.body.appendChild(printContainer);

      document.body.classList.add('printing-active');

      setTimeout(() => {
        try {
          window.print();
          resolve({ success: true, message: "Print Successful" });
        } catch (err) {
          console.error("[DirectPrint] Browser fallback print failed:", err);
          resolve({ success: false, message: "Printer Not Connected" });
        } finally {
          document.body.classList.remove('printing-active');
          if (document.body.contains(printContainer)) {
            document.body.removeChild(printContainer);
          }
          if (document.head.contains(printStyle)) {
            document.head.removeChild(printStyle);
          }
        }
      }, 150);
    });
  }
};
