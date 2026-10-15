import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Animated,
  Easing,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Theme } from "../constants/theme";
import { Fonts } from "../constants/Fonts";
import { useGeneralSettingsStore } from "../stores/generalSettingsStore";
import { useToast } from "../components/Toast";
import { API_URL } from "../constants/Config";
import { useAuthStore } from "../stores/authStore";

// ── SLEEK COMPACT ANIMATED SWITCH COMPONENT ──
interface CustomSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
}

const CustomSwitch = ({ value, onValueChange, disabled = false }: CustomSwitchProps) => {
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [value]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 25],
  });

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [Theme.border, Theme.primary],
  });

  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.8}
      onPress={() => !disabled && onValueChange(!value)}
      style={styles.switchTouchArea}
    >
      <Animated.View
        style={[
          styles.switchContainer,
          { backgroundColor },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Animated.View
          style={[
            styles.switchThumb,
            { transform: [{ translateX }] },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

export default function GeneralSettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  const { settings, loading, fetchSettings, updateSettings } = useGeneralSettingsStore();

  // Local setting states
  const [enableKOT, setEnableKOT] = useState(settings.enableKOT !== undefined ? settings.enableKOT : true);
  const [enableKDS, setEnableKDS] = useState(settings.enableKDS !== undefined ? settings.enableKDS : true);
  const [enableCheckoutBill, setEnableCheckoutBill] = useState(settings.enableCheckoutBill !== undefined ? settings.enableCheckoutBill : true);
  const [enableCheckoutFlow, setEnableCheckoutFlow] = useState(settings.enableCheckoutFlow !== undefined ? settings.enableCheckoutFlow : true);
  const [enableDirectProcessToPay, setEnableDirectProcessToPay] = useState(settings.enableDirectProcessToPay !== undefined ? settings.enableDirectProcessToPay : false);
  const [customerSideDisplay, setCustomerSideDisplay] = useState(settings.customerSideDisplay !== undefined ? settings.customerSideDisplay : true);
  const [enableGuestDetailsPopup, setEnableGuestDetailsPopup] = useState(settings.enableGuestDetailsPopup !== undefined ? settings.enableGuestDetailsPopup : true);
  const [enableCashDrawer, setEnableCashDrawer] = useState(settings.enableCashDrawer !== undefined ? settings.enableCashDrawer : true);
  const [SVCIdentification, setSVCIdentification] = useState(settings.SVCIdentification !== undefined ? settings.SVCIdentification : true);
  const [enableKDSPrint, setEnableKDSPrint] = useState(settings.enableKDSPrint !== undefined ? settings.enableKDSPrint : true);
  const [enableCombo, setEnableCombo] = useState(settings.enableCombo !== undefined ? settings.enableCombo : true);
  const [enableReceiptPrint, setEnableReceiptPrint] = useState(settings.enableReceiptPrint !== undefined ? settings.enableReceiptPrint : true);
  const [skipSummary, setSkipSummary] = useState(settings.skipSummary !== undefined ? settings.skipSummary : false);
  const [showLoyalty, setShowLoyalty] = useState(settings.showLoyalty !== undefined ? settings.showLoyalty : true);
  const [showRewardPoints, setShowRewardPoints] = useState(settings.showRewardPoints !== undefined ? settings.showRewardPoints : true);
  const [showPromoCode, setShowPromoCode] = useState(settings.showPromoCode !== undefined ? settings.showPromoCode : true);
  const [showBillTime, setShowBillTime] = useState(settings.showBillTime !== undefined ? settings.showBillTime : true);
  const [vipRuleEnabled, setVipRuleEnabled] = useState(settings.vipRuleEnabled !== undefined ? settings.vipRuleEnabled : false);

  // Cloud ERP Sync States
  const [cloudSyncInterval, setCloudSyncInterval] = useState(String(settings.cloudSyncIntervalMinutes || 15));
  const [autoPushDayEnd, setAutoPushDayEnd] = useState(settings.autoPushOnDayEnd !== undefined ? settings.autoPushOnDayEnd : true);
  const [syncStatus, setSyncStatus] = useState<{ isCloudReachable: boolean; pendingCount: number; lastSyncTime: string | null } | null>(null);
  const [syncingPush, setSyncingPush] = useState(false);
  const [syncingPull, setSyncingPull] = useState(false);

  // Tablet Local SQLite Queue States
  const [tabletQueueCount, setTabletQueueCount] = useState<number>(0);
  const [tabletSyncing, setTabletSyncing] = useState<boolean>(false);

  const fetchTabletQueueCount = async () => {
    try {
      const { SyncQueueRepository, OrderRepository } = require("../db");
      const [qCount, unsyncedOrders] = await Promise.all([
        SyncQueueRepository.getQueueCount().catch(() => 0),
        OrderRepository.getUnsyncedOrders().catch(() => []),
      ]);
      const totalPending = Math.max(Number(qCount || 0), Number(unsyncedOrders?.length || 0));
      setTabletQueueCount(totalPending);
    } catch (err) {
      console.warn("Could not fetch tablet SQLite queue count:", err);
    }
  };

  const handleTabletManualPush = async () => {
    setTabletSyncing(true);
    try {
      const { OrderRepository, SettlementRepository, AttendanceRepository, CashDrawerRepository, SyncQueueRepository } = require("../db");
      const { executeQuery } = require("../db/database");
      const axios = require("axios").default || require("axios");

      const unsyncedBatch = await OrderRepository.getUnsyncedOrders();
      const unsyncedAlterations = await SettlementRepository.getPendingAlterations();
      const unsyncedAttendance = await AttendanceRepository.getUnsyncedAttendance();
      const unsyncedDrawerLogs = await CashDrawerRepository.getUnsyncedLogs();
      const unsyncedDayEnds = await executeQuery(`SELECT * FROM day_end_records WHERE is_synced = 0`).catch(() => []);

      const totalItems = unsyncedBatch.length + unsyncedAlterations.length + unsyncedAttendance.length + unsyncedDrawerLogs.length + unsyncedDayEnds.length;
      if (totalItems === 0) {
        showToast({
          type: "success",
          message: "All Caught Up!",
          subtitle: "No pending offline orders on this tablet.",
        });
        setTabletQueueCount(0);
        return;
      }

      const cleanApi = (API_URL || "").trim().replace(/\/+$/, "");
      const res = await axios.post(
        `${cleanApi}/api/sync/push`,
        {
          batch: unsyncedBatch,
          alterations: unsyncedAlterations,
          attendance: unsyncedAttendance,
          drawer_logs: unsyncedDrawerLogs,
          day_end_records: unsyncedDayEnds,
        },
        { timeout: 20000 }
      );

      if (res.data?.success) {
        const syncedIds = res.data.synced_client_ids || [];
        if (syncedIds.length > 0) {
          await OrderRepository.markOrdersSynced(syncedIds);
        }
        const syncedAltIds = res.data.synced_alteration_ids || [];
        for (const altId of syncedAltIds) {
          await SettlementRepository.removeAlteration(altId);
        }
        const syncedAttIds = res.data.synced_attendance_ids || [];
        if (syncedAttIds.length > 0) {
          await AttendanceRepository.markAttendanceSynced(syncedAttIds);
        }
        const syncedDrawerIds = res.data.synced_drawer_ids || [];
        if (syncedDrawerIds.length > 0) {
          await CashDrawerRepository.markLogsSynced(syncedDrawerIds);
        }
        const syncedDayEndIds = res.data.synced_day_end_ids || [];
        if (syncedDayEndIds.length > 0) {
          const placeholders = syncedDayEndIds.map(() => "?").join(",");
          await executeQuery(`UPDATE day_end_records SET is_synced = 1 WHERE id IN (${placeholders})`, syncedDayEndIds);
        }

        const totalPushed = (syncedIds.length || 0) + (syncedAltIds.length || 0) + (syncedAttIds.length || 0) + (syncedDrawerIds.length || 0) + (syncedDayEndIds.length || 0);
        showToast({
          type: "success",
          message: "Synced to Server!",
          subtitle: `Successfully pushed ${totalPushed || unsyncedBatch.length} pending record(s) to cloud/server.`,
          duration: 4000,
        });

        await fetchTabletQueueCount();
        fetchSyncStatus();
      } else {
        throw new Error(res.data?.error || "Server rejected push sync.");
      }
    } catch (pushErr: any) {
      console.error("Manual push failed:", pushErr);
      const errorMsg = pushErr.response?.data?.error || pushErr.message || "Network timeout or server unreachable. Order remains safely saved on tablet.";
      showToast({
        type: "error",
        message: "Push Sync Failed",
        subtitle: errorMsg,
        duration: 5000,
      });
    } finally {
      setTabletSyncing(false);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/sync/status`);
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (e) {
      console.warn("Could not fetch sync status:", e);
    }
  };

  const handleManualPush = async () => {
    setSyncingPush(true);
    try {
      const res = await fetch(`${API_URL}/api/sync/push-now`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: "success",
          message: data.pushedCount > 0 
            ? `Successfully pushed ${data.pushedCount} bills to Cloud ERP!` 
            : "All bills are already up to date with Cloud ERP.",
        });
      } else {
        showToast({
          type: "warning",
          message: data.error || "Cloud server unreachable. Saved locally.",
        });
      }
      fetchSyncStatus();
    } catch (err: any) {
      showToast({ type: "error", message: `Push failed: ${err.message}` });
    } finally {
      setSyncingPush(false);
    }
  };

  const handleManualPull = async () => {
    setSyncingPull(true);
    try {
      const res = await fetch(`${API_URL}/api/sync/pull-now`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const dishText = `${data.dishCount || 0} menu items`;
        const salesText = data.pulledSalesCount ? ` & ${data.pulledSalesCount} sales` : "";
        showToast({
          type: "success",
          message: `Pulled ${dishText}${salesText} from Cloud ERP.`,
        });
      } else {
        showToast({
          type: "warning",
          message: data.error || "Cloud server unreachable.",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", message: `Pull failed: ${err.message}` });
    } finally {
      setSyncingPull(false);
    }
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingCashDrawerValue, setPendingCashDrawerValue] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchSyncStatus();
    fetchTabletQueueCount();
  }, []);

  useEffect(() => {
    setEnableKOT(settings.enableKOT);
    setEnableKDS(settings.enableKDS);
    setEnableCheckoutBill(settings.enableCheckoutBill);
    setCustomerSideDisplay(settings.customerSideDisplay);
    setEnableGuestDetailsPopup(settings.enableGuestDetailsPopup !== undefined ? settings.enableGuestDetailsPopup : true);
    setEnableCashDrawer(settings.enableCashDrawer !== undefined ? settings.enableCashDrawer : true);
    setSVCIdentification(settings.SVCIdentification !== undefined ? settings.SVCIdentification : true);
    setEnableKDSPrint(settings.enableKDSPrint !== undefined ? settings.enableKDSPrint : true);
    setEnableCombo(settings.enableCombo !== undefined ? settings.enableCombo : true);
    setEnableReceiptPrint(settings.enableReceiptPrint !== undefined ? settings.enableReceiptPrint : true);
    setSkipSummary(settings.skipSummary !== undefined ? settings.skipSummary : false);
    setShowLoyalty(settings.showLoyalty !== undefined ? settings.showLoyalty : true);
    setShowRewardPoints(settings.showRewardPoints !== undefined ? settings.showRewardPoints : true);
    setShowPromoCode(settings.showPromoCode !== undefined ? settings.showPromoCode : true);
    setShowBillTime(settings.showBillTime !== undefined ? settings.showBillTime : true);
    setVipRuleEnabled(settings.vipRuleEnabled !== undefined ? settings.vipRuleEnabled : false);
    setCloudSyncInterval(String(settings.cloudSyncIntervalMinutes || 15));
    setAutoPushDayEnd(settings.autoPushOnDayEnd !== undefined ? settings.autoPushOnDayEnd : true);

    let initialCheckoutFlow = settings.enableCheckoutFlow;
    let initialDirectProcess = settings.enableDirectProcessToPay;

    if ((initialCheckoutFlow && initialDirectProcess) || (!initialCheckoutFlow && !initialDirectProcess)) {
      initialCheckoutFlow = true;
      initialDirectProcess = false;
    }

    setEnableCheckoutFlow(initialCheckoutFlow);
    setEnableDirectProcessToPay(initialDirectProcess);
  }, [settings]);


  const handleToggleCashDrawer = (val: boolean) => {
    setPendingCashDrawerValue(val);
    setPasswordValue("");
    setShowPasswordModal(true);
  };

  const handlePasswordVerify = async () => {
    if (!passwordValue) {
      showToast({ type: "warning", message: "Please enter password" });
      return;
    }
    setVerifyingPassword(true);
    try {
      const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordValue }),
      });
      const verifyData = await verifyRes.json();
      if (verifyData.success) {
        if (pendingCashDrawerValue !== null) {
          setEnableCashDrawer(pendingCashDrawerValue);
        }
        setShowPasswordModal(false);
        showToast({ type: "success", message: "Access Unlocked" });
      } else {
        if (Platform.OS === "web") {
          window.alert("Incorrect admin password");
        } else {
          Alert.alert("Access Denied", "Incorrect admin password");
        }
      }
    } catch (err) {
      if (Platform.OS === "web") {
        window.alert("Could not verify password. Check connection.");
      } else {
        Alert.alert("Error", "Could not verify password. Check connection.");
      }
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleToggleCheckoutFlow = (val: boolean) => {
    if (val) {
      setEnableCheckoutFlow(true);
      setEnableDirectProcessToPay(false);
    } else {
      setEnableCheckoutFlow(false);
      setEnableDirectProcessToPay(true);
    }
  };

  const handleToggleDirectProcessToPay = (val: boolean) => {
    if (val) {
      setEnableDirectProcessToPay(true);
      setEnableCheckoutFlow(false);
    } else {
      setEnableDirectProcessToPay(false);
      setEnableCheckoutFlow(true);
    }
  };

  const handleSave = () => {
    setShowConfirmModal(true);
  };

  const performSave = async () => {
    setSaving(true);
    const success = await updateSettings({
      enableKOT,
      enableKDS,
      enableCheckoutBill,
      enableCheckoutFlow,
      enableDirectProcessToPay,
      customerSideDisplay,
      enableGuestDetailsPopup,
      enableCashDrawer,
      SVCIdentification,
      enableKDSPrint,
      enableCombo,
      showLoyalty,
      showRewardPoints,
      showPromoCode,
      showBillTime,
      vipRuleEnabled,
      enableReceiptPrint,
      skipSummary,
      cloudSyncIntervalMinutes: parseInt(cloudSyncInterval) || 15,
      autoPushOnDayEnd: autoPushDayEnd,
    });

    setSaving(false);

    if (success) {
      showToast({ type: "success", message: "Settings saved successfully." });
      router.replace("/(tabs)/category" as any);
    } else {
      showToast({ type: "error", message: "Failed to save settings. Please try again." });
    }
  };

  const categories = [
    {
      name: "Workflow & Operations",
      icon: "git-network-outline",
      items: [
        {
          title: "Guest Details Popup",
          desc: "Show guest info details popup before entering order screen.",
          icon: "people-outline",
          value: enableGuestDetailsPopup,
          onToggle: setEnableGuestDetailsPopup,
        },
        {
          title: "Enable Checkout Flow",
          desc: "Enable order summary checkout step.",
          icon: "git-compare-outline",
          value: enableCheckoutFlow,
          onToggle: handleToggleCheckoutFlow,
        },
        {
          title: "Enable Direct Process To Pay",
          desc: "Show 'Process To Pay' shortcut button in Cart Sidebar.",
          icon: "card-outline",
          value: enableDirectProcessToPay,
          onToggle: handleToggleDirectProcessToPay,
        },
        {
          title: "Combo Feature",
          desc: "Enable combo menu items and selections wizard.",
          icon: "fast-food-outline",
          value: enableCombo,
          onToggle: setEnableCombo,
        },
      ]
    },
    {
      name: "Receipts & Screen Displays",
      icon: "print-outline",
      items: [
        {
          title: "KOT (Kitchen Order Ticket)",
          desc: "Enable kitchen ticket printing.",
          icon: "receipt-outline",
          value: enableKOT,
          onToggle: setEnableKOT,
        },
        {
          title: "Checkout Bill",
          desc: "Enable checkout receipt printing.",
          icon: "wallet-outline",
          value: enableCheckoutBill,
          onToggle: setEnableCheckoutBill,
        },
        {
          title: "Order Hub (Order Display)",
          desc: "Show Order Hub screen.",
          icon: "desktop-outline",
          value: enableKDS,
          onToggle: setEnableKDS,
        },
        {
          title: "Customer-Side Display",
          desc: "Enable/disable secondary customer screen sync.",
          icon: "tv-outline",
          value: customerSideDisplay,
          onToggle: setCustomerSideDisplay,
        },
        {
          title: "KDS Printer Button",
          desc: "Enable KDS copy auto-printing and show the PRINT button on KDS screen.",
          icon: "print-outline",
          value: enableKDSPrint,
          onToggle: setEnableKDSPrint,
        },
        {
          title: "Show Bill Time",
          desc: "Display order time on all printed bills, KOTs, and receipts.",
          icon: "time-outline",
          value: showBillTime,
          onToggle: setShowBillTime,
        },
        {
          title: "Receipt Print",
          desc: "Automatically print receipt on payment success without prompt.",
          icon: "receipt-outline",
          value: enableReceiptPrint,
          onToggle: setEnableReceiptPrint,
        },
        {
          title: "Skip Summary",
          desc: "Bypass the bill summary screen during checkout and proceed straight to payment.",
          icon: "play-skip-forward-outline",
          value: skipSummary,
          onToggle: setSkipSummary,
        },
      ]
    },
    {
      name: "Drawer & Charges",
      icon: "cash-outline",
      items: [
        {
          title: "Enable Cash Drawer Module",
          desc: "Enable checkout cashbox opening triggers.",
          icon: "wallet-outline",
          value: enableCashDrawer,
          onToggle: handleToggleCashDrawer,
        },
        {
          title: "SVC Identification",
          desc: "Highlight Service (SVC) items with red identification.",
          icon: "pricetag-outline",
          value: SVCIdentification,
          onToggle: setSVCIdentification,
        },
      ]
    },
    {
      name: "Loyalty & Promotions",
      icon: "gift-outline",
      items: [
        {
          title: "Enable VIP Flow",
          desc: "Configure automatic VIP threshold promos and active rules.",
          icon: "people-circle-outline",
          value: vipRuleEnabled,
          onToggle: setVipRuleEnabled,
        },
        {
          title: "Loyalty Feature",
          desc: "Show the Loyalty button in the POS Summary screen.",
          icon: "ribbon-outline",
          value: showLoyalty,
          onToggle: setShowLoyalty,
        },
        {
          title: "Reward Points Feature",
          desc: "Show the Reward Points button in the POS Summary screen.",
          icon: "gift-outline",
          value: showRewardPoints,
          onToggle: setShowRewardPoints,
        },
        {
          title: "Promo Code Feature",
          desc: "Show the Promo Code button in the POS Summary screen.",
          icon: "pricetag-outline",
          value: showPromoCode,
          onToggle: setShowPromoCode,
        },
      ]
    }
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/menu/settlement" as any);
            }
          }} 
          style={styles.backBtn} 
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="settings" size={22} color={Theme.primary} />
            <Text style={styles.headerTitle}>General Settings</Text>
          </View>
        </View>
      </View>

      {/* Body Grid */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ☁️ CLOUD ERP SYNCHRONIZATION CARD */}
        <View style={styles.cloudSyncContainer}>
          <View style={styles.cloudSyncHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={styles.cloudIconWrapper}>
                <Ionicons name="cloud-done" size={20} color="#38bdf8" />
              </View>
              <View>
                <Text style={styles.cloudTitle}>Cloud ERP Synchronization</Text>
                <Text style={styles.cloudSubtitle}>HQ Cloud DB: myerpcloud.dyndns.org:9199</Text>
              </View>
            </View>

            {/* Connection Status Pill */}
            <View style={[
              styles.cloudStatusBadge, 
              syncStatus?.isCloudReachable ? styles.cloudStatusOnline : styles.cloudStatusOffline
            ]}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: syncStatus?.isCloudReachable ? "#22c55e" : "#f59e0b" }
              ]} />
              <Text style={styles.cloudStatusText}>
                {syncStatus?.isCloudReachable ? "Cloud Online" : "Cloud Offline (Local Mode)"}
              </Text>
            </View>
          </View>

          {/* Sync Stats & Quick Controls */}
          <View style={styles.cloudStatsRow}>
            <View style={styles.cloudStatBox}>
              <Text style={styles.cloudStatLabel}>PENDING BILLS TO PUSH</Text>
              <Text style={[styles.cloudStatValue, (syncStatus?.pendingCount || 0) > 0 && { color: "#f59e0b" }]}>
                {syncStatus?.pendingCount !== undefined ? syncStatus.pendingCount : 0}
              </Text>
            </View>

            <View style={styles.cloudStatBox}>
              <Text style={styles.cloudStatLabel}>LAST SYNCED</Text>
              <Text style={styles.cloudStatValueSmall}>
                {syncStatus?.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just Now"}
              </Text>
            </View>

            <View style={styles.cloudStatBox}>
              <Text style={styles.cloudStatLabel}>AUTO-SYNC INTERVAL</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <TextInput
                  style={styles.intervalInput}
                  value={cloudSyncInterval}
                  onChangeText={setCloudSyncInterval}
                  keyboardType="numeric"
                  maxLength={3}
                />
                <Text style={{ color: Theme.textSecondary, fontSize: 13, fontFamily: Fonts.medium }}>min</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.cloudButtonsRow}>
            <TouchableOpacity
              style={[styles.syncActionBtn, syncingPush && { opacity: 0.7 }]}
              onPress={handleManualPush}
              disabled={syncingPush}
              activeOpacity={0.8}
            >
              {syncingPush ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={styles.syncActionBtnText}>Push Sales to Cloud Now</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.syncActionBtnSecondary, syncingPull && { opacity: 0.7 }]}
              onPress={handleManualPull}
              disabled={syncingPull}
              activeOpacity={0.8}
            >
              {syncingPull ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color="#38bdf8" />
                  <Text style={styles.syncActionBtnSecondaryText}>Pull Menu / Dishes</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Auto Push Day End Toggle */}
            <View style={styles.autoPushToggleWrapper}>
              <View>
                <Text style={styles.autoPushToggleTitle}>Auto-Push on Day End</Text>
                <Text style={styles.autoPushToggleDesc}>Upload all closed sales at shift closing</Text>
              </View>
              <CustomSwitch value={autoPushDayEnd} onValueChange={setAutoPushDayEnd} />
            </View>
          </View>
        </View>

        {/* 📱 TABLET LOCAL SQLITE QUEUE & DIRECT PUSH CARD */}
        <View style={[styles.cloudSyncContainer, { borderColor: "#4f46e5", backgroundColor: "#0f172a" }]}>
          <View style={styles.cloudSyncHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.cloudIconWrapper, { backgroundColor: "rgba(99, 102, 241, 0.15)" }]}>
                <Ionicons name="phone-portrait-outline" size={20} color="#818cf8" />
              </View>
              <View>
                <Text style={styles.cloudTitle}>Tablet Local SQLite Queue</Text>
                <Text style={styles.cloudSubtitle}>This Device Storage (Offline Sales & Attendance)</Text>
              </View>
            </View>

            <View style={[
              styles.cloudStatusBadge, 
              tabletQueueCount === 0 ? styles.cloudStatusOnline : styles.cloudStatusOffline
            ]}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: tabletQueueCount === 0 ? "#22c55e" : "#f59e0b" }
              ]} />
              <Text style={styles.cloudStatusText}>
                {tabletQueueCount === 0 ? "All Orders Synced" : `${tabletQueueCount} Pending Push`}
              </Text>
            </View>
          </View>

          <View style={styles.cloudStatsRow}>
            <View style={styles.cloudStatBox}>
              <Text style={styles.cloudStatLabel}>DEVICE PENDING ORDERS</Text>
              <Text style={[styles.cloudStatValue, tabletQueueCount > 0 && { color: "#f59e0b" }]}>
                {tabletQueueCount}
              </Text>
            </View>

            <View style={styles.cloudStatBox}>
              <Text style={styles.cloudStatLabel}>STATUS</Text>
              <Text style={styles.cloudStatValueSmall}>
                {tabletQueueCount > 0 ? "Waiting to upload" : "Up to date"}
              </Text>
            </View>

            <View style={styles.cloudStatBox}>
              <Text style={styles.cloudStatLabel}>TARGET SERVER</Text>
              <Text style={[styles.cloudStatValueSmall, { fontSize: 13, color: "#38bdf8" }]} numberOfLines={1}>
                {API_URL?.replace(/^https?:\/\//, '') || "Server"}
              </Text>
            </View>
          </View>

          <View style={styles.cloudButtonsRow}>
            <TouchableOpacity
              style={[styles.syncActionBtn, { backgroundColor: "#6366f1" }, tabletSyncing && { opacity: 0.7 }]}
              onPress={handleTabletManualPush}
              disabled={tabletSyncing}
              activeOpacity={0.8}
            >
              {tabletSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
                  <Text style={styles.syncActionBtnText}>Push Tablet SQLite to Server Now</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.syncActionBtnSecondary, { borderColor: "#818cf8" }]}
              onPress={fetchTabletQueueCount}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={18} color="#818cf8" />
              <Text style={[styles.syncActionBtnSecondaryText, { color: "#818cf8" }]}>Check Queue</Text>
            </TouchableOpacity>
          </View>
        </View>

        {categories.map((cat, catIdx) => (

          <View key={catIdx} style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name={cat.icon as any} size={18} color={Theme.primary} />
              <Text style={styles.sectionTitle}>{cat.name}</Text>
            </View>
            <View style={styles.gridContainer}>
              {cat.items.map((item, index) => (
                <View
                  key={index}
                  style={[
                    styles.settingCard,
                    item.value && styles.settingCardActive,
                    isTablet ? styles.cardTablet : styles.cardMobile,
                  ]}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.cardHeaderRow}>
                      <View style={[styles.iconWrapper, item.value ? styles.iconWrapperActive : styles.iconWrapperInactive]}>
                        <Ionicons name={item.icon as any} size={18} color={item.value ? Theme.primary : Theme.textSecondary} />
                      </View>
                      <Text style={styles.settingTitle} numberOfLines={1}>{item.title}</Text>
                    </View>
                    <Text style={styles.settingDesc}>{item.desc}</Text>
                  </View>
                  <CustomSwitch value={item.value} onValueChange={item.onToggle} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/menu/settlement" as any);
            }
          }}
          disabled={saving || loading}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, (saving || loading) && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving || loading}
          activeOpacity={0.8}
        >
          {saving || loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Settings</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Admin Password Modal for Cash Drawer toggle verification */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.pwOverlay}>
          <View style={styles.pwModalContent}>
            <View style={styles.pwHeader}>
              <Text style={styles.pwTitle}>Admin Verification Required</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={styles.pwClose}>
                <Ionicons name="close" size={20} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.pwBody}>
              <Text style={styles.pwDesc}>Please enter admin password to unlock Cash Drawer settings.</Text>
              <TextInput
                style={styles.pwInput}
                secureTextEntry
                placeholder="Enter password..."
                value={passwordValue}
                onChangeText={setPasswordValue}
                onSubmitEditing={handlePasswordVerify}
                autoFocus
              />
              <TouchableOpacity
                style={styles.pwBtn}
                onPress={handlePasswordVerify}
                disabled={verifyingPassword}
                activeOpacity={0.8}
              >
                {verifyingPassword ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.pwBtnText}>Verify Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Save Changes Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.pwOverlay}>
          <View style={styles.pwModalContent}>
            <View style={styles.pwHeader}>
              <Text style={styles.pwTitle}>Confirm Changes</Text>
              <TouchableOpacity onPress={() => setShowConfirmModal(false)} style={styles.pwClose}>
                <Ionicons name="close" size={20} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.pwBody}>
              <Text style={styles.pwDesc}>Are you sure you want to update settings? These changes will apply globally to all users.</Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { flex: 1, height: 44 }]}
                  onPress={() => setShowConfirmModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pwBtn, { flex: 1, height: 44, marginTop: 0 }]}
                  onPress={() => {
                    setShowConfirmModal(false);
                    performSave();
                  }}
                >
                  <Text style={styles.pwBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    paddingLeft: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  header: {
    height: 72,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.bgNav,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    position: "relative",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    left: 24,
    padding: 8,
    borderRadius: 10,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
    zIndex: 10,
  },
  headerTitleContainer: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  settingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#172B4D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  settingCardActive: {
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.primary,
    borderLeftWidth: 4,
    borderLeftColor: Theme.primary,
    shadowColor: Theme.primary,
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  cardMobile: {
    width: "100%",
  },
  cardTablet: {
    width: "49%",
  },
  cardLeft: {
    flex: 1,
    paddingRight: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapperActive: {
    backgroundColor: Theme.primary + "15",
  },
  iconWrapperInactive: {
    backgroundColor: Theme.bgMuted,
  },
  settingTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    flex: 1,
  },
  settingDesc: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  switchTouchArea: {
    paddingVertical: 4,
  },
  switchContainer: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.bgCard,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  footer: {
    padding: 20,
    backgroundColor: Theme.bgNav,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelBtn: {
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.bgMuted,
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  saveBtn: {
    height: 46,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  pwOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  pwModalContent: {
    width: 380,
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  pwHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  pwTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  pwClose: {
    padding: 4,
  },
  pwBody: {
    gap: 16,
  },
  pwDesc: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  pwInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Theme.textPrimary,
    outlineWidth: 0,
  },
  pwBtn: {
    height: 44,
    backgroundColor: Theme.primary,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  pwBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#fff",
  },

  /* ☁️ Cloud ERP Sync Styling */
  cloudSyncContainer: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#1e293b",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  cloudSyncHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    paddingBottom: 16,
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 12,
  },
  cloudIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  cloudTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#f8fafc",
  },
  cloudSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#94a3b8",
    marginTop: 2,
  },
  cloudStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  cloudStatusOnline: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  cloudStatusOffline: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  cloudStatusText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: "#f8fafc",
  },
  cloudStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  cloudStatBox: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cloudStatLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#94a3b8",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  cloudStatValue: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: "#22c55e",
  },
  cloudStatValueSmall: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#f8fafc",
  },
  intervalInput: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 6,
    color: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 14,
    fontFamily: Fonts.bold,
    width: 48,
    textAlign: "center",
  },
  cloudButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  syncActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0284c7",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  syncActionBtnText: {
    color: "#ffffff",
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  syncActionBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "#38bdf8",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  syncActionBtnSecondaryText: {
    color: "#38bdf8",
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  autoPushToggleWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 16,
    flex: 1,
    minWidth: 260,
  },
  autoPushToggleTitle: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#f8fafc",
  },
  autoPushToggleDesc: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: "#94a3b8",
  },
});

