import React, { useState, useEffect, useRef } from "react";
// @ts-ignore
import logoSvg from "@/assets/logo.svg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DataService, ShopDetails } from "@/services/dataService";
import { toast } from "sonner";
import { safeSessionStorage, safeLocalStorage } from "@/utils/safeStorage";

const sessionStorage = safeSessionStorage;
const localStorage = safeLocalStorage;

import {
  defineAbilityFor,
  getCurrentUserRole,
  AppAbility,
} from "@/services/abilityService";
import {
  Store,
  FileText,
  MapPin,
  Phone,
  Save,
  User,
  Mail,
  Users,
  Share2,
  Trash2,
  Camera,
  CheckCircle2,
  Globe,
  Laptop,
  Check,
  Shield,
  Lock,
  Key,
  Copy,
  Plus,
  Send,
  RefreshCw,
  Database,
  AlertTriangle,
  Table,
} from "lucide-react";

const getMongoDiagnosticMessage = (errorStr: string) => {
  if (!errorStr) return null;
  const lower = errorStr.toLowerCase();
  
  if (lower.includes('bad auth') || lower.includes('authentication failed')) {
    return {
      title: "Incorrect Password or Username (गलत पासवर्ड या यूजरनेम)",
      desc: "आपका पासवर्ड या यूजरनेम गलत है। कृपया ध्यान दें कि MongoDB Atlas में डेटाबेस यूजर का पासवर्ड और आपके Atlas लॉगिन का पासवर्ड अलग होता है। Database Access में जाकर नया पासवर्ड बनाएं और उसे MONGODB_URI में डालें।",
      icon: "🔑",
    };
  }
  
  if (lower.includes('unescaped characters') || lower.includes('must not contain unescaped')) {
    return {
      title: "Special Characters in Password (पासवर्ड में स्पेशल कैरेक्टर्स)",
      desc: "आपके पासवर्ड में @, #, :, + जैसे स्पेशल कैरेक्टर्स हैं जो MongoDB कनेक्शन स्ट्रिंग को खराब कर रहे हैं। या तो इन्हें Atlas में बदलें (केवल लेटर्स और नंबर्स रखें) या URL-encode करें (जैसे @ की जगह %40 लिखें)।",
      icon: "⚠️",
    };
  }
  
  if (lower.includes('selection timeout') || lower.includes('timed out') || lower.includes('timeout')) {
    return {
      title: "Network IP Whitelist Issue (आईपी व्हाइटलिस्ट या फायरवॉल ब्लॉक)",
      desc: "सर्वर MongoDB से कनेक्ट नहीं कर पा रहा है। इसका मुख्य कारण है कि आपने MongoDB Atlas में IP Whitelist सेटअप नहीं किया है। कृपया MongoDB Atlas -> Network Access में जाकर IP Address 0.0.0.0/0 (Allow Access from Anywhere) ऐड करें।",
      icon: "🌐",
    };
  }
  
  if (lower.includes('invalid connection string') || lower.includes('scheme must be')) {
    return {
      title: "Invalid Connection Format (कनेक्शन स्ट्रिंग का गलत फॉर्मेट)",
      desc: "कनेक्शन स्ट्रिंग का फॉर्मेट गलत है। यह 'mongodb+srv://...' या 'mongodb://...' से शुरू होना चाहिए। कृपया जांचें कि कहीं कोई स्पेस या गलत कैरेक्टर तो टाइप नहीं हो गया है।",
      icon: "📝",
    };
  }
  
  return {
    title: "General Atlas Connection Error (सामान्य डेटाबेस कनेक्शन एरर)",
    desc: "सर्वर MongoDB से कनेक्ट नहीं हो पा रहा है। कृपया जांचें कि आपका MONGODB_URI सही है, और MongoDB Atlas में Network Access (IP 0.0.0.0/0) चालू है।",
    icon: "🔌",
  };
};

export default function ShopSettings() {
  const [details, setDetails] = useState<ShopDetails>({
    name: "",
    address: "",
    phone: "",
    paperSize: "80mm",
    logo: "",
    allowBelowStock: false,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"shop" | "user" | "gmail">(
    "shop",
  );
  const [userRole, setUserRole] = useState<"Admin" | "Manager" | "Cashier">(
    "Cashier",
  );
  const [ability, setAbility] = useState<AppAbility | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  // Gmail SMTP settings state
  const [gmailSettings, setGmailSettings] = useState({
    email: "",
    appPassword: "",
    enabled: false,
    autoSend: false,
    adminCopyEmail: "",
  });
  const [gmailTestRecipient, setGmailTestRecipient] = useState("");
  const [isGmailTesting, setIsGmailTesting] = useState(false);
  const [isGmailSaving, setIsGmailSaving] = useState(false);

  const handleCopyLink = (email: string) => {
    const inviteUrl = `${window.location.origin}?invite_email=${encodeURIComponent(email)}`;
    navigator.clipboard
      .writeText(inviteUrl)
      .then(() => {
        setCopiedEmail(email);
        toast.success(`Invite link for ${email} copied to clipboard!`);
        setTimeout(() => setCopiedEmail(null), 2000);
      })
      .catch(() => {
        toast.error("Failed to copy invite link");
      });
  };

  // Security credentials state
  const [casherPin, setCasherPin] = useState("12345");
  const [casherEnabled, setCasherEnabled] = useState(true);

  // User Profile state
  const [userProfile, setUserProfile] = useState<{
    name: string;
    email: string;
    avatar?: string;
  }>({
    name: "",
    email: "",
    avatar: "",
  });

  // Shared emails list state
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [emailRoles, setEmailRoles] = useState<
    Record<string, "Admin" | "Manager" | "Cashier">
  >({});
  const [newShareEmail, setNewShareEmail] = useState("");
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [isLogoUploading, setIsLogoUploading] = useState(false);

  // Google Ads-style Cooperative Access sharing states
  const [requestsQueue, setRequestsQueue] = useState<any[]>([]);
  const [sendingVerification, setSendingVerification] =
    useState<boolean>(false);
  const [resettingSetup, setResettingSetup] = useState(false);
  const [resettingFactory, setResettingFactory] = useState(false);

  // MongoDB Status diagnostics states
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingDbStatus, setLoadingDbStatus] = useState(false);

  // Account deletion states
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const fetchDbStatus = async () => {
    setLoadingDbStatus(true);
    try {
      const status = await DataService.getDbStatus();
      setDbStatus(status);
    } catch (e) {
      console.error("Failed to load database status:", e);
    } finally {
      setLoadingDbStatus(false);
    }
  };

  const handleResetSetup = async () => {
    if (!canManageShop) {
      toast.error("You do not have permission to reset the database.");
      return;
    }
    const confirmText = window.prompt(
      "⚠️ WARNING (सावधानी):\nThis will delete all Products, Sales, and Purchases. User accounts and configurations are safely preserved.\n\nType 'RESET' to confirm transactional reset:",
    );
    if (confirmText !== "RESET") {
      toast.info("Database reset cancelled.");
      return;
    }

    setResettingSetup(true);
    const id = toast.loading(
      "Resetting transactional and catalog database...",
      { duration: 0 },
    );
    try {
      const res = await DataService.resetInstallation();
      toast.dismiss(id);
      if (res.success) {
        toast.success("Database successfully reset! Reloading...");
        sessionStorage.clear();
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.dismiss(id);
      toast.error(e.message || "Failed to reset database.");
    } finally {
      setResettingSetup(false);
    }
  };

  const handleFactoryReset = async () => {
    if (!canManageShop) {
      toast.error("You do not have permission to perform a factory reset.");
      return;
    }
    const confirmText = window.prompt(
      "🛑 CRITICAL WARNING (चेतावनी):\nThis will COMPLETELY WIPE OUT everything: all user accounts, passwords, transactions, items, and settings across SQLite and MongoDB Cloud.\n\nType 'START FRESH' to confirm complete system wipe:",
    );
    if (confirmText !== "START FRESH") {
      toast.info("Factory reset cancelled.");
      return;
    }

    setResettingFactory(true);
    const id = toast.loading(
      "Wiping database completely and resetting to absolute zero...",
      { duration: 0 },
    );
    try {
      const res = await DataService.startFresh();
      toast.dismiss(id);
      if (res.success) {
        toast.success("System completely wiped and reset successfully!");
        localStorage.clear();
        sessionStorage.clear();
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.dismiss(id);
      toast.error(e.message || "Failed to perform factory reset.");
    } finally {
      setResettingFactory(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const shopLogoInputRef = useRef<HTMLInputElement>(null);

  const handleSendInvitation = async () => {
    const cleanEmail = newShareEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@") || cleanEmail.length < 5) {
      toast.error(
        "Please enter a valid Gmail address",
      );
      return;
    }
    setSendingVerification(true);
    const res = await DataService.sendInvitation(cleanEmail);
    setSendingVerification(false);
    if (res.success) {
      setNewShareEmail("");
      toast.success(res.message);
      // Reload pending invitations from DB
      const requests = await DataService.getAccessRequests();
      setRequestsQueue(requests.sent || []);
    } else {
      toast.error(res.message);
    }
  };

  const handleCancelInvitation = async (id: string) => {
    const res = await DataService.cancelInvitation(id);
    if (res.success) {
      toast.success(res.message);
      // Reload pending invitations
      const requests = await DataService.getAccessRequests();
      setRequestsQueue(requests.sent || []);
    } else {
      toast.error(res.message);
    }
  };

  useEffect(() => {
    const load = async () => {
      const shopData = await DataService.getShopDetails();
      setDetails({
        ...shopData,
        paperSize: shopData.paperSize || "80mm",
        logo: shopData.logo || "",
        allowBelowStock: !!shopData.allowBelowStock,
      });

      const userData = await DataService.getUserProfile();
      setUserProfile(userData);

      const shareData = await DataService.getSharedEmails();
      setSharedEmails(shareData);

      const rolesMap = await DataService.getEmailRoles();
      setEmailRoles(
        rolesMap as Record<string, "Admin" | "Manager" | "Cashier">,
      );

      const requests = await DataService.getAccessRequests();
      setRequestsQueue(requests.sent || []);

      const pin = await DataService.getCasherPin();
      setCasherPin(pin);
      const isEnabled = await DataService.getCasherEnabled();
      setCasherEnabled(isEnabled);

      try {
        const gmailData = await DataService.getGmailSettings();
        setGmailSettings(gmailData);
      } catch (err) {
        console.error("Failed to load gmail settings inside load():", err);
      }

      const role = await getCurrentUserRole();
      setUserRole(role);
      const activeAbility = defineAbilityFor(role);
      setAbility(activeAbility);

      if (
        !activeAbility.can("manage", "ShopDetails") &&
        !activeAbility.can("read", "ShopDetails")
      ) {
        setActiveTab("user");
      } else {
        setActiveTab("shop");
      }

      setLoading(false);
      // Fetch database status for diagnostics
      fetchDbStatus();
    };
    load();

    // Subscribe to live database updates for multi-computer instant synchronizations
    const unsubscribe = DataService.subscribe(async () => {
      const shareData = await DataService.getSharedEmails();
      setSharedEmails(shareData);

      const rolesMap = await DataService.getEmailRoles();
      setEmailRoles(
        rolesMap as Record<string, "Admin" | "Manager" | "Cashier">,
      );

      const requests = await DataService.getAccessRequests();
      setRequestsQueue(requests.sent || []);

      const userData = await DataService.getUserProfile();
      setUserProfile(userData);

      const pin = await DataService.getCasherPin();
      setCasherPin(pin);
      const isEnabled = await DataService.getCasherEnabled();
      setCasherEnabled(isEnabled);

      try {
        const gmailData = await DataService.getGmailSettings();
        setGmailSettings(gmailData);
      } catch (err) {}

      const shopData = await DataService.getShopDetails();
      setDetails({
        ...shopData,
        paperSize: shopData.paperSize || "80mm",
        logo: shopData.logo || "",
        allowBelowStock: !!shopData.allowBelowStock,
      });

      const role = await getCurrentUserRole();
      setUserRole(role);
      setAbility(defineAbilityFor(role));
    });

    return () => unsubscribe();
  }, []);

  const handleSaveShop = async () => {
    await DataService.setShopDetails(details);
    toast.success("Shop details updated successfully");
  };

  const handleSaveGmailSettings = async () => {
    setIsGmailSaving(true);
    const success = await DataService.saveGmailSettings(gmailSettings);
    setIsGmailSaving(false);
    if (success) {
      toast.success("Gmail connector configurations saved and active!");
    } else {
      toast.error("Failed to save Gmail configurations");
    }
  };

  const handleTestGmailConnection = async () => {
    if (!gmailSettings.email.trim() || !gmailSettings.appPassword.trim()) {
      toast.error("Please enter a Gmail address and your App Password first.");
      return;
    }
    setIsGmailTesting(true);
    toast.loading("Testing connection with Google SMTP servers...", {
      id: "gmail-test",
    });

    try {
      const res = await DataService.sendGmailTest(
        gmailSettings.email.trim(),
        gmailSettings.appPassword.trim(),
        gmailTestRecipient.trim() || undefined,
      );

      if (res.success) {
        toast.dismiss("gmail-test");
        toast.success(res.message, { duration: 6000 });
      } else {
        toast.dismiss("gmail-test");
        toast.error(res.message, { duration: 6000 });
      }
    } catch (e: any) {
      toast.dismiss("gmail-test");
      toast.error(e.message || "Unknown SMTP integration error", {
        duration: 6000,
      });
    } finally {
      setIsGmailTesting(false);
    }
  };

  const handleSaveUserProfile = async () => {
    if (!userProfile.name.trim() || !userProfile.email.trim()) {
      toast.error("Name and Email are required");
      return;
    }

    try {
      // 1. Get current saved user profile to compare
      const oldProfile = await DataService.getUserProfile();
      const oldEmail = (oldProfile.email || "").trim().toLowerCase();
      const newEmail = userProfile.email.trim().toLowerCase();

      // 2. Save new user profile
      await DataService.setUserProfile(userProfile);

      // 3. Update all places if the email has changed
      if (oldEmail && oldEmail !== newEmail) {
        // Update Shared Emails
        const shared = await DataService.getSharedEmails();
        const lowerShared = shared.map((e) => e.trim().toLowerCase());

        let updatedShared = [...shared];
        const index = lowerShared.indexOf(oldEmail);
        if (index > -1) {
          updatedShared[index] = userProfile.email;
        } else {
          if (!lowerShared.includes(newEmail)) {
            updatedShared.push(userProfile.email);
          }
        }
        // Exclude the old email
        updatedShared = updatedShared.filter(
          (e) =>
            e.trim().toLowerCase() !== oldEmail ||
            e.trim().toLowerCase() === newEmail,
        );
        await DataService.setSharedEmails(updatedShared);

        // Update Email Roles
        const rolesMap = await DataService.getEmailRoles();
        const updatedRoles = { ...rolesMap };
        if (oldEmail in updatedRoles) {
          updatedRoles[newEmail] = updatedRoles[oldEmail];
          delete updatedRoles[oldEmail];
        } else {
          updatedRoles[newEmail] = "Admin";
        }
        await DataService.setEmailRoles(updatedRoles);

        // Update active auth email if the person logged in is editing themselves
        const currentAuthEmail = sessionStorage.getItem("retailpro_auth_email") || localStorage.getItem("retailpro_auth_email");
        if (
          currentAuthEmail &&
          currentAuthEmail.trim().toLowerCase() === oldEmail
        ) {
          sessionStorage.setItem("retailpro_auth_email", newEmail);
          localStorage.setItem("retailpro_auth_email", newEmail);
        }

        toast.success(
          "User Profile updated! New email address is successfully synchronized across all systems.",
        );
      } else {
        toast.success("User Profile updated successfully");
      }
    } catch (err: any) {
      toast.error(`Error updated profile: ${err.message}`);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      toast.error("Password/PIN is required to delete your account.");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const email = userProfile.email || sessionStorage.getItem("retailpro_auth_email") || localStorage.getItem("retailpro_auth_email");
      if (!email) {
        throw new Error("Unable to identify current logged-in user email.");
      }

      const res = await DataService.deleteAccount(email, deletePassword);
      if (res.success) {
        toast.success("Account deleted successfully! Logging you out...");
        
        // Clean session and local storage
        sessionStorage.removeItem("retailpro_auth");
        sessionStorage.removeItem("retailpro_auth_email");
        sessionStorage.removeItem("retailpro_active_workspace");
        localStorage.removeItem("retailpro_auth");
        localStorage.removeItem("retailpro_auth_email");
        localStorage.removeItem("retailpro_active_workspace");
        localStorage.removeItem("retailpro_saved_accounts");

        // Reload page to show login/welcome screen
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast.error(res.message || "Failed to delete account. Please verify password.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error deleting account.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const [savingSecurity, setSavingSecurity] = useState(false);

  const handleSaveSecurity = async () => {
    setSavingSecurity(true);
    try {
      await DataService.setCasherEnabled(casherEnabled);
      await DataService.setCasherPin(casherPin);
      toast.success("Terminal security configurations saved successfully!");
    } catch (e: any) {
      toast.error(e.message || "Failed to save security configuration");
    } finally {
      setSavingSecurity(false);
    }
  };

  const handlePhotoUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleShopLogoUploadClick = () => {
    shopLogoInputRef.current?.click();
  };

  const handleShopLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo file size must be strictly below 2MB");
      return;
    }

    setIsLogoUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const logoData = reader.result as string;
      const updatedDetails = { ...details, logo: logoData };
      setDetails(updatedDetails);
      await DataService.setShopDetails(updatedDetails);
      setIsLogoUploading(false);
      toast.success(
        "Shop logo successfully uploaded and set! Welcome to the workspace.",
      );
    };
    reader.onerror = () => {
      setIsLogoUploading(false);
      toast.error("Unable to upload logo file");
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size must be strictly below 2MB");
      return;
    }

    setIsPhotoUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const avatarData = reader.result as string;
      const updatedProfile = { ...userProfile, avatar: avatarData };
      setUserProfile(updatedProfile);
      await DataService.setUserProfile(updatedProfile);
      setIsPhotoUploading(false);
      toast.success("Profile photo successfully uploaded and set!");
    };
    reader.onerror = () => {
      setIsPhotoUploading(false);
      toast.error("Unable to upload image file");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveEmailShare = async (emailToRemove: string) => {
    try {
      const profile = await DataService.getUserProfile();
      const ownerEmail = (profile.email || "").trim().toLowerCase();
      if (emailToRemove.trim().toLowerCase() === ownerEmail) {
        toast.error("Cannot revoke main systems administrator access");
        return;
      }

      const res = await DataService.revokeAccess(emailToRemove);
      if (res.success) {
        toast.success(res.message);
        // Refresh shared emails list
        const shared = await DataService.getSharedEmails();
        setSharedEmails(shared);
        // Refresh pending list
        const requests = await DataService.getAccessRequests();
        setRequestsQueue(requests.sent || []);
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error(`Error revoking email: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 font-extrabold animate-pulse uppercase tracking-widest text-sm">
        Retrieving Config Database...
      </div>
    );
  }

  const canManageShop = ability?.can("manage", "ShopDetails") ?? false;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Tab Selectors */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm gap-1">
        {ability?.can("read", "ShopDetails") && (
          <button
            onClick={() => setActiveTab("shop")}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "shop"
                ? "bg-primary text-white shadow-md"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            <Store className="h-4 w-4 shrink-0" />
            <span className="truncate">Shop Settings</span>
            {!canManageShop && (
              <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold uppercase px-1.5 py-0.5 rounded tracking-normal block shrink-0">
                Read-Only
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => setActiveTab("user")}
          className={`flex-1 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === "user"
              ? "bg-primary text-white shadow-md"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          }`}
        >
          <User className="h-4 w-4" />
          User Profile
        </button>
        {/* Tab button for Terminal Security has been removed as requested */}
      </div>

      {/* SHOP SETTINGS PANEL */}
      {activeTab === "shop" && (
        <div className="space-y-6 animate-fade-in">
          <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2rem]">
            <CardHeader className="p-4 sm:p-8 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-black flex items-center gap-3">
                    <Store className="h-7 w-7 text-primary" />
                    Shop Profile Details
                  </CardTitle>
                  <p className="text-slate-500 font-medium text-xs sm:text-sm mt-1">
                    These details will appear on your generated invoices and
                    receipts.
                  </p>
                </div>
                {!canManageShop && (
                  <div className="px-4 py-2 bg-amber-50 rounded-2xl border border-amber-200/50 flex items-center gap-2 text-amber-800 text-xs font-bold uppercase tracking-wider self-start sm:self-auto">
                    <Lock className="h-4 w-4 shrink-0" />
                    Read-Only Mode
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-8 pt-0 space-y-6">
              {/* Shop Logo Uploader Section */}
              <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-3xl border border-slate-100 relative">
                <div
                  className={`relative group ${canManageShop ? "cursor-pointer" : "cursor-default opacity-80"}`}
                  onClick={
                    canManageShop ? handleShopLogoUploadClick : undefined
                  }
                >
                  <div className="h-28 w-28 rounded-3xl border-4 border-white shadow-xl overflow-hidden bg-white flex items-center justify-center transition-transform hover:scale-105 p-1">
                    {details.logo ? (
                      <img
                        src={details.logo}
                        alt="Shop Logo"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img
                        src={logoSvg}
                        alt="Shop Logo"
                        className="h-full w-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                  {canManageShop && (
                    <button className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-transform">
                      <Camera className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={shopLogoInputRef}
                  onChange={handleShopLogoFileChange}
                  accept="image/*"
                  className="hidden"
                  disabled={!canManageShop}
                />

                {canManageShop ? (
                  <>
                    <h4 className="font-extrabold text-slate-800 text-sm mt-4 uppercase tracking-wider">
                      {isLogoUploading
                        ? "Uploading file..."
                        : "Click to change Shop Logo"}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      Image size strictly under 2MB (Square works best)
                    </p>
                  </>
                ) : (
                  <h4 className="font-extrabold text-slate-400 text-xs mt-3 uppercase tracking-wider">
                    Logo Locked for non-admins
                  </h4>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
                  <Store className="h-3 w-3" /> Shop Name
                </Label>
                <Input
                  value={details.name}
                  onChange={(e) =>
                    setDetails({ ...details, name: e.target.value })
                  }
                  placeholder="Store Name"
                  className="h-12 text-base font-bold uppercase border-slate-200 focus-visible:ring-primary"
                  disabled={!canManageShop}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
                  <MapPin className="h-3 w-3" /> Business Address
                </Label>
                <Input
                  value={details.address}
                  onChange={(e) =>
                    setDetails({ ...details, address: e.target.value })
                  }
                  placeholder="Store Address"
                  className="h-12 text-base border-slate-200 focus-visible:ring-primary"
                  disabled={!canManageShop}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
                  <Phone className="h-3 w-3" /> Contact Number
                </Label>
                <Input
                  value={details.phone}
                  onChange={(e) =>
                    setDetails({ ...details, phone: e.target.value })
                  }
                  placeholder="e.g. +91 9450000000"
                  className="h-12 text-base font-mono border-slate-200 focus-visible:ring-primary"
                  disabled={!canManageShop}
                />
              </div>





              {canManageShop && (
                <div className="space-y-4 pt-6 border-t border-slate-150">
                  <Button
                    onClick={handleSaveShop}
                    className="w-full h-12 text-base font-bold gap-2 shadow-lg shadow-primary/20 cursor-pointer"
                  >
                    <Save className="h-5 w-5" /> SAVE SHOP DETAILS
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>


        </div>
      )}

      {/* USER PROFILE & PROFILE PICTURE PANEL */}
      {activeTab === "user" && (
        <div className="space-y-6 animate-fade-in">
          <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2rem]">
            <CardHeader className="p-4 sm:p-8 pb-4">
              <CardTitle className="text-xl sm:text-2xl font-black flex items-center gap-3">
                <User className="h-7 w-7 text-primary" />
                User Account Profile
              </CardTitle>
              <p className="text-slate-500 font-medium text-xs sm:text-sm">
                Update your cashier profile name, email, and upload a dynamic
                profile picture.
              </p>
            </CardHeader>
            <CardContent className="p-4 sm:p-8 pt-0 space-y-6">
              {/* Profile Photo Uploader Section */}
              <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-3xl border border-slate-100 relative">
                <div
                  className="relative group cursor-pointer"
                  onClick={handlePhotoUploadClick}
                >
                  <div className="h-28 w-28 rounded-full border-4 border-white shadow-xl overflow-hidden bg-slate-200 flex items-center justify-center transition-transform hover:scale-105">
                    {userProfile.avatar ? (
                      userProfile.avatar.startsWith('http://') || userProfile.avatar.startsWith('https://') || userProfile.avatar.startsWith('data:image/') ? (
                        <img
                          src={userProfile.avatar}
                          alt="Profile Photo"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl">{userProfile.avatar}</span>
                      )
                    ) : (
                      <span className="text-2xl font-black text-slate-500">
                        {userProfile.name
                          ? userProfile.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .substring(0, 2)
                              .toUpperCase()
                          : "OS"}
                      </span>
                    )}
                  </div>
                  <button className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-transform">
                    <Camera className="h-4 w-4" />
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoFileChange}
                  accept="image/*"
                  className="hidden"
                />

                <h4 className="font-extrabold text-slate-800 text-sm mt-4 uppercase tracking-wider">
                  {isPhotoUploading
                    ? "Uploading file..."
                    : "Click photo to change"}
                </h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                  Image size strictly under 2MB (Square works best)
                </p>
              </div>

              {/* Input Fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
                    <User className="h-3.5 w-3.5" /> Full Name
                  </Label>
                  <Input
                    value={userProfile.name}
                    onChange={(e) =>
                      setUserProfile({ ...userProfile, name: e.target.value })
                    }
                    placeholder="Enter full name"
                    className="h-12 text-base font-semibold border-slate-200 focus-visible:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" /> Email Address
                  </Label>
                  <Input
                    type="email"
                    value={userProfile.email}
                    onChange={(e) =>
                      setUserProfile({ ...userProfile, email: e.target.value })
                    }
                    placeholder="Enter email address"
                    className="h-12 text-base border-slate-200 focus-visible:ring-primary font-medium"
                  />
                </div>
              </div>

              <Button
                onClick={handleSaveUserProfile}
                className="w-full h-12 text-base font-bold gap-2 shadow-lg shadow-primary/20 mb-6 cursor-pointer"
              >
                <Save className="h-5 w-5" /> SAVE USER PROFILE CHANGES
              </Button>

              {/* DANGER ZONE: DELETE ACCOUNT */}
              <div className="pt-6 border-t border-red-100 space-y-4">
                <div className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                  <h3 className="text-base font-extrabold uppercase tracking-wider">Danger Zone</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Permanently delete your login account credentials from the database. This action is irreversible.
                </p>

                {!isDeleteMode ? (
                  <Button
                    onClick={() => setIsDeleteMode(true)}
                    className="w-full h-11 text-sm font-bold gap-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-2xl transition-all cursor-pointer shadow-sm"
                  >
                    <Trash2 className="h-4 w-4" /> Delete My Account
                  </Button>
                ) : (
                  <div className="space-y-4 p-5 bg-red-50/30 border border-red-100 rounded-2xl animate-fade-in">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-red-600 flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5" /> Confirm Password / PIN
                      </Label>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Please enter your account password or PIN for <strong>{userProfile.email}</strong> to authorize deletion:
                      </p>
                      <Input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder="Enter your current password/PIN"
                        className="h-11 text-sm font-semibold border-red-200 focus-visible:ring-red-500 bg-white"
                      />
                    </div>
                    <div className="flex gap-3 pt-1">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsDeleteMode(false);
                          setDeletePassword("");
                        }}
                        className="flex-1 h-10 text-xs font-bold border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDeleteAccount}
                        disabled={isDeletingAccount}
                        className="flex-1 h-10 text-xs font-bold gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-200 rounded-xl"
                      >
                        {isDeletingAccount ? "Deleting..." : "Confirm Delete"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}



        {/* Terminal security panel has been removed as requested */}
    </div>
  );
}
