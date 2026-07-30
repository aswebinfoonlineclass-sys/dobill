import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Bluetooth, 
  Usb, 
  Wifi, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Power, 
  X, 
  Play
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DirectPrintService, isAndroidNative, isElectronApp, SavedPrinterInfo } from '@/services/directPrintService';
import { toast } from 'sonner';

interface PrinterPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PrinterPickerModal: React.FC<PrinterPickerModalProps> = ({ open, onOpenChange }) => {
  const [activeTab, setActiveTab] = useState<'bluetooth' | 'usb' | 'tcp'>('bluetooth');
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<Array<{ name: string; address: string }>>([]);
  const [connectingAddress, setConnectingAddress] = useState<string | null>(null);
  
  // TCP IP fields
  const [tcpIp, setTcpIp] = useState('192.168.1.100');
  const [tcpPort, setTcpPort] = useState('9100');

  // Active saved printer
  const [savedPrinter, setSavedPrinter] = useState<SavedPrinterInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isTestPrinting, setIsTestPrinting] = useState(false);

  const refreshPrinterStatus = async () => {
    const saved = DirectPrintService.getSavedPrinter();
    setSavedPrinter(saved);
    setIsConnected(DirectPrintService.isPrinterConnected());
  };

  useEffect(() => {
    if (open) {
      refreshPrinterStatus();
      if (isAndroidNative()) {
        handleScanBluetooth();
      }
    }
  }, [open]);

  const handleScanBluetooth = async () => {
    setIsScanning(true);
    setDiscoveredDevices([]);
    try {
      if (isAndroidNative()) {
        const devices = await DirectPrintService.scanAndroidPrinters();
        setDiscoveredDevices(devices);
        if (devices.length === 0) {
          toast.info("No Bluetooth thermal printers found. Make sure printer is turned ON.");
        }
      } else {
        toast.info("Click 'Scan / Pair Bluetooth' to open browser picker.");
      }
    } catch (err: any) {
      console.error("Bluetooth scan error:", err);
      toast.error(err.message || "Failed to scan for Bluetooth devices.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnectBluetoothDevice = async (address?: string, name?: string) => {
    setConnectingAddress(address || 'browser');
    try {
      const res = await DirectPrintService.connectBluetooth(address);
      if (res.success) {
        toast.success(`Connected to ${res.name}!`);
        await refreshPrinterStatus();
      } else {
        toast.error(res.error || "Failed to connect to printer.");
      }
    } catch (err: any) {
      toast.error(`Connection error: ${err.message || err}`);
    } finally {
      setConnectingAddress(null);
    }
  };

  const handleConnectUSB = async () => {
    try {
      const res = await DirectPrintService.connectUSB();
      if (res.success) {
        toast.success(`Connected to ${res.name}!`);
        await refreshPrinterStatus();
      } else {
        toast.error(res.error || "Failed to connect USB printer.");
      }
    } catch (err: any) {
      toast.error(`USB error: ${err.message || err}`);
    }
  };

  const handleSaveTcp = async () => {
    if (!tcpIp.trim()) {
      toast.error("Please enter a valid IP address.");
      return;
    }
    try {
      const res = await DirectPrintService.selectAndroidPrinter({
        type: 'android_tcp',
        name: `Network Printer (${tcpIp})`,
        ip: tcpIp.trim(),
        port: parseInt(tcpPort) || 9100
      });
      if (res.success) {
        toast.success(`Saved Network Printer ${tcpIp}!`);
        await refreshPrinterStatus();
      } else {
        toast.error(res.error || "Failed to save TCP printer.");
      }
    } catch (err: any) {
      toast.error(`TCP error: ${err.message || err}`);
    }
  };

  const handleDisconnect = async () => {
    await DirectPrintService.disconnect();
    toast.success("Printer disconnected.");
    await refreshPrinterStatus();
  };

  const handleRunTestPrint = async () => {
    setIsTestPrinting(true);
    try {
      await DirectPrintService.testPrintDirect();
      toast.success("Test receipt sent to printer!");
    } catch (err: any) {
      toast.error(`Test print failed: ${err.message || err}`);
    } finally {
      setIsTestPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full p-6 bg-white rounded-2xl shadow-2xl border border-slate-200">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Printer className="h-5 w-5 text-indigo-600" />
              Thermal Printer Setup
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {isAndroidNative() ? 'Android Native Direct Thermal ESC/POS Printing' : isElectronApp() ? 'Windows EXE Thermal Printing' : 'Web Browser Thermal Printing'}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Current Printer Status Banner */}
        <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
          isConnected 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isConnected ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  {savedPrinter?.name || DirectPrintService.getConnectedPrinterName() || 'No Printer Selected'}
                </span>
                <Badge variant="outline" className={`text-[9px] uppercase font-black tracking-wider ${
                  isConnected ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}>
                  {isConnected ? 'ONLINE' : 'NOT CONNECTED'}
                </Badge>
              </div>
              <p className="text-xs opacity-75 mt-0.5">
                {savedPrinter ? `Type: ${savedPrinter.type.toUpperCase()}` : 'Select a printer below'}
              </p>
            </div>
          </div>

          {isConnected && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleDisconnect} 
              className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              title="Disconnect Printer"
            >
              <Power className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Connection Type Tabs */}
        <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl">
          <Button
            type="button"
            variant={activeTab === 'bluetooth' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('bluetooth')}
            className="text-xs font-bold gap-1.5 h-9"
          >
            <Bluetooth className="h-3.5 w-3.5" />
            Bluetooth
          </Button>
          <Button
            type="button"
            variant={activeTab === 'usb' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('usb')}
            className="text-xs font-bold gap-1.5 h-9"
          >
            <Usb className="h-3.5 w-3.5" />
            USB OTG
          </Button>
          <Button
            type="button"
            variant={activeTab === 'tcp' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('tcp')}
            className="text-xs font-bold gap-1.5 h-9"
          >
            <Wifi className="h-3.5 w-3.5" />
            Network
          </Button>
        </div>

        {/* Tab 1: Bluetooth */}
        {activeTab === 'bluetooth' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nearby Bluetooth Printers</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleScanBluetooth} 
                disabled={isScanning}
                className="h-8 text-xs font-bold gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <RefreshCw className={`h-3 w-3 ${isScanning ? 'animate-spin' : ''}`} />
                {isScanning ? 'Scanning...' : 'Scan Again'}
              </Button>
            </div>

            {discoveredDevices.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {discoveredDevices.map((dev) => (
                  <div 
                    key={dev.address}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-xs text-slate-800">{dev.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">{dev.address}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleConnectBluetoothDevice(dev.address, dev.name)}
                      disabled={connectingAddress === dev.address}
                      className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700"
                    >
                      {connectingAddress === dev.address ? 'Connecting...' : 'Connect'}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <Bluetooth className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-medium">
                  {isScanning ? 'Scanning for nearby Bluetooth printers...' : 'No Bluetooth printers found yet.'}
                </p>
                <Button 
                  variant="link" 
                  onClick={() => handleConnectBluetoothDevice()} 
                  className="text-xs text-indigo-600 mt-1 font-bold"
                >
                  Pair / Scan via System Settings
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: USB OTG */}
        {activeTab === 'usb' && (
          <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 space-y-3">
            <Usb className="h-10 w-10 text-slate-400 mx-auto" />
            <div>
              <p className="text-xs font-bold text-slate-800">USB Thermal Printer</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Connect your thermal printer using a USB OTG cable to your Android phone or tablet.
              </p>
            </div>
            <Button 
              onClick={handleConnectUSB}
              className="w-full h-10 font-bold bg-indigo-600 hover:bg-indigo-700 gap-2 text-xs"
            >
              <Usb className="h-4 w-4" />
              Connect USB Printer
            </Button>
          </div>
        )}

        {/* Tab 3: Network TCP/IP */}
        {activeTab === 'tcp' && (
          <div className="space-y-4 p-4 border border-slate-200 rounded-xl bg-slate-50">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">Printer IP Address</Label>
              <Input 
                placeholder="e.g. 192.168.1.100" 
                value={tcpIp}
                onChange={(e) => setTcpIp(e.target.value)}
                className="bg-white text-xs font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">Port (Default 9100)</Label>
              <Input 
                placeholder="9100" 
                value={tcpPort}
                onChange={(e) => setTcpPort(e.target.value)}
                className="bg-white text-xs font-mono"
              />
            </div>
            <Button 
              onClick={handleSaveTcp}
              className="w-full h-10 font-bold bg-indigo-600 hover:bg-indigo-700 gap-2 text-xs"
            >
              <Wifi className="h-4 w-4" />
              Save Network Printer
            </Button>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <Button 
            variant="outline" 
            onClick={handleRunTestPrint} 
            disabled={!isConnected || isTestPrinting}
            className="flex-1 h-10 font-bold text-xs gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <Play className="h-3.5 w-3.5" />
            {isTestPrinting ? 'Printing...' : 'Run Test Print'}
          </Button>

          <Button 
            onClick={() => onOpenChange(false)}
            className="flex-1 h-10 font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
