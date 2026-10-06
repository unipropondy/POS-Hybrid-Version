import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/Fonts";
import { useAuthStore } from "@/stores/authStore";
import { useOrderContextStore } from "@/stores/orderContextStore";
import { useToast } from "@/components/Toast";
import { API_URL } from "@/constants/Config";
import { useGeneralSettingsStore } from "@/stores/generalSettingsStore";

// High-resolution photography
const DINE_IN_IMG = "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?q=80&w=1000&auto=format&fit=crop";
const TAKE_AWAY_IMG = "https://images.unsplash.com/photo-1526367790999-0150786686a2?q=80&w=1000&auto=format&fit=crop";
const QUICK_SERVE_IMG = "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1000&auto=format&fit=crop";
const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/4140/4140048.png";

export default function OrderTypeSelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isLandscape = width > 768; // Tablet & Desktop view check

  const { user, logout } = useAuthStore();
  const toast = useToast();
  const { settings, fetchSettings } = useGeneralSettingsStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showQuickServeModal, setShowQuickServeModal] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  // Accordion state for Category-style dropdown menu
  const [isTablesExpanded, setIsTablesExpanded] = useState(false);
  const [isStaffExpanded, setIsStaffExpanded] = useState(false);
  const [isCustomerExpanded, setIsCustomerExpanded] = useState(false);
  const [isReportsExpanded, setIsReportsExpanded] = useState(false);

  // Dynamic company settings from Receipt/Company settings API
  const [companyInfo, setCompanyInfo] = useState<{
    CompanyName?: string;
    CompanyLogoUrl?: string;
  } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings && settings.enableQuickServe === false) {
      router.replace("/(tabs)/category" as any);
    }
  }, [settings?.enableQuickServe]);

  useEffect(() => {
    fetch(`${API_URL}/api/company-settings/1`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && data.settings) {
          setCompanyInfo(data.settings);
        }
      })
      .catch((err) => console.log("Error fetching company settings:", err));
  }, []);

  // Live clock and date update
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const dateOptions: Intl.DateTimeFormatOptions = {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      };
      setCurrentDate(now.toLocaleDateString("en-US", dateOptions));

      const timeOptions: Intl.DateTimeFormatOptions = {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };
      setCurrentTime(now.toLocaleTimeString("en-US", timeOptions));
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (settings && settings.enableQuickServe === false) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F8FAFC", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#FF9500" />
      </View>
    );
  }

  // Handlers for Order Types
  const handleDineIn = () => {
    useOrderContextStore.getState().setOrderContext({
      orderType: "DINE_IN",
    });
    router.push("/(tabs)/category");
  };

  const handleTakeAway = () => {
    const takeawayNo = `TW-${Math.floor(1000 + Math.random() * 9000)}`;
    useOrderContextStore.getState().setOrderContext({
      orderType: "TAKEAWAY",
      takeawayNo,
    });
    router.push("/(tabs)/category");
  };

  const handleQuickServe = () => {
    setShowQuickServeModal(true);
  };

  // Menu item navigation handler
  const handleMenuNavigate = (route: string) => {
    setMenuOpen(false);
    if (route === "logout") {
      logout();
      router.replace("/login");
    } else {
      router.push(route as any);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* HEADER BAR */}
      <View style={styles.header}>
        {/* Left: Receipt Settings Logo & Name */}
        <View style={styles.headerLeft}>
          {companyInfo?.CompanyLogoUrl ? (
            <Image
              source={{ uri: companyInfo.CompanyLogoUrl }}
              style={styles.headerCompanyLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.logoBadge}>
              <Ionicons name="restaurant" size={20} color="#FFFFFF" />
            </View>
          )}

          <View style={styles.brandTitleContainer}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.brandTitle}>
                {companyInfo?.CompanyName || "FOOD POS"}
              </Text>
            </View>
            <Text style={styles.brandSubtitle}>RESTAURANT SYSTEM</Text>
          </View>
        </View>

        {/* Center: Date & Time Display */}
        <View style={styles.headerCenter}>
          <View style={styles.dateTimeBadge}>
            <View style={styles.badgeItem}>
              <Ionicons name="calendar-outline" size={14} color="#FF9500" />
              <Text style={styles.dateTimeText}>{currentDate}</Text>
            </View>
            <View style={styles.dateTimeDivider} />
            <View style={styles.badgeItem}>
              <Ionicons name="time-outline" size={14} color="#FF9500" />
              <Text style={styles.dateTimeText}>{currentTime}</Text>
            </View>
          </View>
        </View>

        {/* Right: User Avatar & Menu Button */}
        <View style={styles.headerRight}>
          <View style={styles.userInfo}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={15} color="#475569" />
              <View style={styles.onlineDot} />
            </View>
            <View style={styles.userTextContainer}>
              <Text style={styles.userName}>{user?.userName || "UNIPRO"}</Text>
              <Text style={styles.userRole}>{user?.role || "ADMIN"}</Text>
            </View>
          </View>

          {/* Menu Button */}
          <TouchableOpacity
            style={[styles.menuButton, menuOpen && styles.menuButtonActive]}
            activeOpacity={0.85}
            onPress={() => setMenuOpen(!menuOpen)}
          >
            <Ionicons name={menuOpen ? "close" : "grid-outline"} size={17} color="#FFFFFF" />
            <Text style={styles.menuButtonText}>Menu</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DROPDOWN MENU MODAL / OVERLAY (EXACT UI FROM CATEGORY SCREEN) */}
      {menuOpen && (
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menuModalContainer, { top: insets.top + 62 }]}>
            {/* Top Banner Header (Orange Gradient Banner from Category Screen) */}
            <View style={styles.menuModalHeaderOrange}>
              <View style={styles.headerAvatarContainer}>
                <Image
                  source={{ uri: DEFAULT_AVATAR }}
                  style={styles.headerAvatarImage}
                />
              </View>
              <View style={styles.headerUserTextCol}>
                <Text style={styles.headerUserNameTextOrange}>
                  {(user?.userName || "UNIPRO").toUpperCase()}
                </Text>
                <Text style={styles.headerUserRoleTextOrange}>
                  {(user?.role || "ADMIN").toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Menu List Items with Accordion Dropdowns matching Category Screen */}
            <ScrollView style={styles.menuListScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.menuListBody}>
                {/* 1. Tables (Expandable Dropdown) */}
                <TouchableOpacity
                  style={[styles.menuRowItem, isTablesExpanded && styles.menuRowItemExpanded]}
                  activeOpacity={0.7}
                  onPress={() => setIsTablesExpanded(!isTablesExpanded)}
                >
                  <View style={styles.menuRowLeft}>
                    <View style={styles.menuIconBox}>
                      <Ionicons name="grid-outline" size={18} color="#E95709" />
                    </View>
                    <Text style={styles.menuRowText}>Tables</Text>
                  </View>
                  <Ionicons
                    name={isTablesExpanded ? "chevron-down" : "chevron-forward"}
                    size={18}
                    color="#64748B"
                  />
                </TouchableOpacity>

                {isTablesExpanded && (
                  <View style={styles.subMenuContainer}>
                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => handleMenuNavigate("/locked-tables")}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="lock-closed-outline" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Locked Tables</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => {
                        useOrderContextStore.getState().setOrderContext({ orderType: "DINE_IN" });
                        handleMenuNavigate("/(tabs)/category");
                      }}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="swap-horizontal-outline" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Transfer Table</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => handleMenuNavigate("/table-master")}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="create-outline" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Table Master</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 2. Staff (Expandable Dropdown) */}
                <TouchableOpacity
                  style={[styles.menuRowItem, isStaffExpanded && styles.menuRowItemExpanded]}
                  activeOpacity={0.7}
                  onPress={() => setIsStaffExpanded(!isStaffExpanded)}
                >
                  <View style={styles.menuRowLeft}>
                    <View style={styles.menuIconBox}>
                      <Ionicons name="people-outline" size={18} color="#E95709" />
                    </View>
                    <Text style={styles.menuRowText}>Staff</Text>
                  </View>
                  <Ionicons
                    name={isStaffExpanded ? "chevron-down" : "chevron-forward"}
                    size={18}
                    color="#64748B"
                  />
                </TouchableOpacity>

                {isStaffExpanded && (
                  <View style={styles.subMenuContainer}>
                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => handleMenuNavigate("/waiters")}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="people" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Waiters</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => handleMenuNavigate("/StaffAttendance")}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="calendar-outline" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Staff Attendance</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 3. Customer (Expandable Dropdown) */}
                <TouchableOpacity
                  style={[styles.menuRowItem, isCustomerExpanded && styles.menuRowItemExpanded]}
                  activeOpacity={0.7}
                  onPress={() => setIsCustomerExpanded(!isCustomerExpanded)}
                >
                  <View style={styles.menuRowLeft}>
                    <View style={styles.menuIconBox}>
                      <Ionicons name="person-add-outline" size={18} color="#E95709" />
                    </View>
                    <Text style={styles.menuRowText}>Customer</Text>
                  </View>
                  <Ionicons
                    name={isCustomerExpanded ? "chevron-down" : "chevron-forward"}
                    size={18}
                    color="#64748B"
                  />
                </TouchableOpacity>

                {isCustomerExpanded && (
                  <View style={styles.subMenuContainer}>
                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => handleMenuNavigate("/members")}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="ribbon-outline" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Loyalty & Customers</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 4. Settlement */}
                <TouchableOpacity
                  style={styles.menuRowItem}
                  activeOpacity={0.7}
                  onPress={() => handleMenuNavigate("/receivables")}
                >
                  <View style={styles.menuRowLeft}>
                    <View style={styles.menuIconBox}>
                      <Ionicons name="calculator-outline" size={18} color="#E95709" />
                    </View>
                    <Text style={styles.menuRowText}>Settlement</Text>
                  </View>
                </TouchableOpacity>

                {/* 5. Reports (Expandable Dropdown) */}
                <TouchableOpacity
                  style={[styles.menuRowItem, isReportsExpanded && styles.menuRowItemExpanded]}
                  activeOpacity={0.7}
                  onPress={() => setIsReportsExpanded(!isReportsExpanded)}
                >
                  <View style={styles.menuRowLeft}>
                    <View style={styles.menuIconBox}>
                      <Ionicons name="document-text-outline" size={18} color="#E95709" />
                    </View>
                    <Text style={styles.menuRowText}>Reports</Text>
                  </View>
                  <Ionicons
                    name={isReportsExpanded ? "chevron-down" : "chevron-forward"}
                    size={18}
                    color="#64748B"
                  />
                </TouchableOpacity>

                {isReportsExpanded && (
                  <View style={styles.subMenuContainer}>
                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => handleMenuNavigate("/sales-report")}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="bar-chart-outline" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Sales Reports</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => handleMenuNavigate("/day-end")}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="today-outline" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Day End Summary</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.subMenuItem}
                      onPress={() => handleMenuNavigate("/cash-drawer-report")}
                    >
                      <View style={styles.subIconBox}>
                        <Ionicons name="wallet-outline" size={16} color="#E95709" />
                      </View>
                      <Text style={styles.subMenuItemText}>Cash Drawer</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 6. Settings */}
                <TouchableOpacity
                  style={styles.menuRowItem}
                  activeOpacity={0.7}
                  onPress={() => handleMenuNavigate("/general-settings")}
                >
                  <View style={styles.menuRowLeft}>
                    <View style={[styles.menuIconBox, { backgroundColor: "#F1F5F9" }]}>
                      <Ionicons name="settings-outline" size={18} color="#64748B" />
                    </View>
                    <Text style={styles.menuRowText}>Settings</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </TouchableOpacity>

                <View style={styles.menuDivider} />

                {/* Logout */}
                <TouchableOpacity
                  style={styles.menuRowItem}
                  activeOpacity={0.7}
                  onPress={() => handleMenuNavigate("logout")}
                >
                  <View style={styles.menuRowLeft}>
                    <View style={[styles.menuIconBox, { backgroundColor: "#FEE2E2" }]}>
                      <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                    </View>
                    <Text style={[styles.menuRowText, { color: "#EF4444" }]}>Logout</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Pressable>
      )}

      {/* MAIN CONTENT AREA - FIXED NON-SCROLL FIT */}
      <View style={styles.mainFixedContainer}>
        {/* Ambient Decorative Background Shapes */}
        <View style={styles.ambientBlob1} />
        <View style={styles.ambientBlob2} />

        <View style={styles.fixedContentInner}>
          {/* HERO TITLE SECTION */}
          <View style={styles.heroSection}>
            <View style={styles.welcomePill}>
              <Ionicons name="sparkles" size={13} color="#FF9500" />
              <Text style={styles.welcomePillText}>Select Service Mode</Text>
            </View>
            <Text style={styles.mainTitle}>
              Welcome to <Text style={{ color: "#FF9500" }}>{companyInfo?.CompanyName || "My Restaurant"}</Text>
            </Text>
            <Text style={styles.subTitle}>
              Choose your order fulfillment type below to start creating bills
            </Text>
          </View>

          {/* CARDS CONTAINER */}
          <View style={[styles.cardsRow, !isLandscape && styles.cardsColumn]}>
            {/* CARD 1: DINE IN */}
            <Pressable
              style={({ pressed }) => [
                styles.card,
                hoveredCard === 1 && styles.cardHovered,
                pressed ? styles.cardPressed : null,
              ]}
              onPress={handleDineIn}
              onHoverIn={() => setHoveredCard(1)}
              onHoverOut={() => setHoveredCard(null)}
            >
              <View style={styles.cardHeaderAccent} />
              
              <View style={styles.cardContentMinimal}>
                <View style={[styles.minimalIconCircle, { borderColor: "#FF4D5E", backgroundColor: "#FFF1F2" }]}>
                  <Ionicons name="restaurant-outline" size={26} color="#FF4D5E" />
                </View>

                <Text style={styles.cardTitle}>DINE IN</Text>
                <View style={[styles.titleUnderline, { backgroundColor: "#FF4D5E" }]} />
                <Text style={styles.cardSubtitle}>Serve customers at designated tables with real-time status</Text>
                
                <View style={styles.featureChipsRow}>
                  <View style={styles.chip}>
                    <Ionicons name="checkmark-circle" size={12} color="#FF4D5E" />
                    <Text style={styles.chipText}>Table Management</Text>
                  </View>
                  <View style={styles.chip}>
                    <Ionicons name="checkmark-circle" size={12} color="#FF4D5E" />
                    <Text style={styles.chipText}>KOT Printing</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: "#FF4D5E" }]}
                  onPress={handleDineIn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionButtonText}>Start Dine In</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
            </Pressable>

            {/* CARD 2: TAKE AWAY */}
            <Pressable
              style={({ pressed }) => [
                styles.card,
                hoveredCard === 2 && styles.cardHovered,
                pressed ? styles.cardPressed : null,
              ]}
              onPress={handleTakeAway}
              onHoverIn={() => setHoveredCard(2)}
              onHoverOut={() => setHoveredCard(null)}
            >
              <View style={[styles.cardHeaderAccent, { backgroundColor: "#FF9500" }]} />
              
              <View style={styles.cardContentMinimal}>
                <View style={[styles.minimalIconCircle, { borderColor: "#FF9500", backgroundColor: "#FFF7ED" }]}>
                  <Ionicons name="bag-handle-outline" size={26} color="#FF9500" />
                </View>

                <Text style={styles.cardTitle}>TAKE AWAY</Text>
                <View style={[styles.titleUnderline, { backgroundColor: "#FF9500" }]} />
                <Text style={styles.cardSubtitle}>Quick order processing for carry-out & pickup orders</Text>
                
                <View style={styles.featureChipsRow}>
                  <View style={styles.chip}>
                    <Ionicons name="checkmark-circle" size={12} color="#FF9500" />
                    <Text style={styles.chipText}>Auto Token No.</Text>
                  </View>
                  <View style={styles.chip}>
                    <Ionicons name="checkmark-circle" size={12} color="#FF9500" />
                    <Text style={styles.chipText}>Fast Checkout</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: "#FF9500" }]}
                  onPress={handleTakeAway}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionButtonText}>Start Take Away</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
            </Pressable>

            {/* CARD 3: QUICK SERVE */}
            {settings.enableQuickServe !== false && (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  hoveredCard === 3 && styles.cardHovered,
                  pressed ? styles.cardPressed : null,
                ]}
                onPress={handleQuickServe}
                onHoverIn={() => setHoveredCard(3)}
                onHoverOut={() => setHoveredCard(null)}
              >
                <View style={[styles.cardHeaderAccent, { backgroundColor: "#22C55E" }]} />
                
                <View style={styles.cardContentMinimal}>
                  <View style={[styles.minimalIconCircle, { borderColor: "#22C55E", backgroundColor: "#F0FDF4" }]}>
                    <Ionicons name="flash-outline" size={26} color="#22C55E" />
                  </View>

                  <Text style={styles.cardTitle}>QUICK SERVE</Text>
                  <View style={[styles.titleUnderline, { backgroundColor: "#22C55E" }]} />
                  <Text style={styles.cardSubtitle}>Rapid billing for high-volume walk-in counters</Text>
                  
                  <View style={styles.featureChipsRow}>
                    <View style={styles.chip}>
                      <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                      <Text style={styles.chipText}>Instant Pay</Text>
                    </View>
                    <View style={styles.chip}>
                      <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                      <Text style={styles.chipText}>Direct KOT</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: "#22C55E" }]}
                    onPress={handleQuickServe}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.actionButtonText}>Start Quick Serve</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                </View>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* COMING SOON MODAL FOR QUICK SERVE */}
      <Modal
        visible={showQuickServeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuickServeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.comingSoonModalCard}>
            <View style={styles.comingSoonIconCircle}>
              <Ionicons name="sparkles" size={32} color="#22C55E" />
            </View>
            <Text style={styles.comingSoonTitle}>Quick Serve Mode</Text>
            <View style={styles.comingSoonBadge}>
              <Ionicons name="time-outline" size={14} color="#15803D" style={{ marginRight: 4 }} />
              <Text style={styles.comingSoonBadgeText}>COMING SOON</Text>
            </View>
            <Text style={styles.comingSoonDesc}>
              Rapid billing for high-volume walk-in counters is under active development and will be available soon!
            </Text>
            <TouchableOpacity
              style={styles.comingSoonBtn}
              onPress={() => setShowQuickServeModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.comingSoonBtnText}>Got it, Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  comingSoonModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: "0 20px 40px rgba(15, 23, 42, 0.15)",
      },
    }),
  },
  comingSoonIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#F0FDF4",
    borderWidth: 1.5,
    borderColor: "#BBF7D0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  comingSoonTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 22,
    color: "#0F172A",
    marginBottom: 8,
  },
  comingSoonBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 14,
  },
  comingSoonBadgeText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 11,
    color: "#15803D",
    letterSpacing: 0.5,
  },
  comingSoonDesc: {
    fontFamily: Fonts.medium || "System",
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  comingSoonBtn: {
    width: "100%",
    backgroundColor: "#22C55E",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  comingSoonBtnText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 15,
    color: "#FFFFFF",
  },
  ambientBlob1: {
    position: "absolute",
    top: -100,
    left: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: "rgba(255, 77, 94, 0.03)",
  },
  ambientBlob2: {
    position: "absolute",
    bottom: -100,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(255, 149, 0, 0.03)",
  },
  header: {
    height: 62,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 4px 20px rgba(15, 23, 42, 0.04)",
      },
    }),
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerCompanyLogo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    marginRight: 12,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FF4D5E",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  brandTitleContainer: {
    justifyContent: "center",
  },
  brandTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 18,
    color: "#0F172A",
    letterSpacing: 0.4,
  },
  proBadge: {
    backgroundColor: "rgba(255, 77, 94, 0.1)",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  proBadgeText: {
    fontSize: 9.5,
    fontFamily: Fonts.bold || "System",
    color: "#FF4D5E",
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 9,
    color: "#64748B",
    letterSpacing: 1.6,
    marginTop: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  badgeItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateTimeText: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 12.5,
    color: "#334155",
    marginLeft: 5,
  },
  dateTimeDivider: {
    width: 1,
    height: 12,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  userTextContainer: {
    justifyContent: "center",
    paddingRight: 2,
  },
  userName: {
    fontFamily: Fonts.bold || "System",
    fontSize: 12.5,
    color: "#1E293B",
  },
  userRole: {
    fontFamily: Fonts.medium || "System",
    fontSize: 10,
    color: "#64748B",
    marginTop: -1,
  },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF9500",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 11,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#FF9500",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 4px 12px rgba(255, 149, 0, 0.25)",
      },
    }),
  },
  menuButtonActive: {
    backgroundColor: "#D97706",
  },
  menuButtonText: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 13.5,
    color: "#FFFFFF",
  },
  menuOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  menuModalContainer: {
    position: "absolute",
    right: 24,
    width: 310,
    maxHeight: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: {
        elevation: 14,
      },
      web: {
        boxShadow: "0 12px 36px rgba(15, 23, 42, 0.16)",
      },
    }),
  },
  menuModalHeaderOrange: {
    backgroundColor: "#E95709",
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerAvatarContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    padding: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  headerUserTextCol: {
    justifyContent: "center",
  },
  headerUserNameTextOrange: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
  headerUserRoleTextOrange: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.9)",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  menuListScrollView: {
    maxHeight: 440,
  },
  menuListBody: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  menuRowItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  menuRowItemExpanded: {
    backgroundColor: "#F8FAFC",
  },
  menuRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFF7ED",
    justifyContent: "center",
    alignItems: "center",
  },
  menuRowText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 15,
    color: "#1E293B",
  },
  subMenuContainer: {
    borderLeftWidth: 2,
    borderLeftColor: "#F1F5F9",
    marginLeft: 28,
    marginVertical: 4,
    paddingLeft: 6,
    gap: 2,
  },
  subMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 10,
  },
  subIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#FFF7ED",
    justifyContent: "center",
    alignItems: "center",
  },
  subMenuItemText: {
    fontFamily: Fonts.medium || "System",
    fontSize: 13.5,
    color: "#334155",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 4,
    marginHorizontal: 10,
  },
  mainFixedContainer: {
    flex: 1,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  fixedContentInner: {
    width: "100%",
    maxWidth: 1120,
    alignItems: "center",
    justifyContent: "center",
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  welcomePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFEDD5",
    marginBottom: 8,
  },
  welcomePillText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 11,
    color: "#FF9500",
    letterSpacing: 0.4,
  },
  mainTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 32,
    color: "#0F172A",
    letterSpacing: 0.4,
    textAlign: "center",
    marginBottom: 4,
  },
  subTitle: {
    fontFamily: Fonts.medium || "System",
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 460,
  },
  cardsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "stretch",
    gap: 24,
    width: "100%",
    maxWidth: 1120,
  },
  cardsColumn: {
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  card: {
    flex: 1,
    minWidth: 290,
    maxWidth: 355,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
      },
      android: {
        elevation: 5,
      },
      web: {
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      },
    }),
  },
  cardHovered: {
    ...Platform.select({
      web: {
        boxShadow: "0 16px 36px rgba(15, 23, 42, 0.10)",
        transform: "translateY(-4px)",
      },
    }),
  },
  cardPressed: {
    opacity: 0.95,
  },
  cardHeaderAccent: {
    height: 4,
    backgroundColor: "#FF4D5E",
    width: "100%",
  },
  cardImageContainer: {
    height: 135,
    width: "100%",
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imageGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
  },
  cardHeaderBadgeRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardTag: {
    backgroundColor: "rgba(255, 77, 94, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  cardTagText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 9.5,
    color: "#FF4D5E",
    letterSpacing: 0.7,
  },
  iconCircleBadge: {
    position: "absolute",
    bottom: -20,
    alignSelf: "center",
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3.5,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.14,
        shadowRadius: 6,
      },
      android: {
        elevation: 5,
      },
      web: {
        boxShadow: "0 3px 10px rgba(0, 0, 0, 0.14)",
      },
    }),
  },
  cardContent: {
    paddingTop: 26,
    paddingBottom: 18,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  cardContentMinimal: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  minimalIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  titleUnderline: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginTop: 4,
    marginBottom: 10,
  },
  cardTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 19,
    color: "#0F172A",
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: Fonts.regular || "System",
    fontSize: 12.5,
    color: "#64748B",
    marginBottom: 12,
    textAlign: "center",
    lineHeight: 17,
  },
  featureChipsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  chipText: {
    fontFamily: Fonts.medium || "System",
    fontSize: 11,
    color: "#475569",
  },
  actionButton: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
      },
    }),
  },
  actionButtonText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
});
