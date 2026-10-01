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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/Fonts";
import { useAuthStore } from "@/stores/authStore";
import { useOrderContextStore } from "@/stores/orderContextStore";
import { useToast } from "@/components/Toast";

// High-resolution photography matching the exact reference image
const DINE_IN_IMG = "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?q=80&w=1000&auto=format&fit=crop";
const TAKE_AWAY_IMG = "https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?q=80&w=1000&auto=format&fit=crop";
const QUICK_SERVE_IMG = "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1000&auto=format&fit=crop";
const BG_PATTERN_IMG = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1600&auto=format&fit=crop";

export default function OrderTypeSelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { user, logout } = useAuthStore();
  const toast = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

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
    toast.showToast({
      message: "⚡ Quick Serve Selected",
      subtitle: "Quick Serve mode is UI ready. Full feature coming soon!",
      type: "info",
      duration: 3000,
    });
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
        {/* Left: Brand Logo & Title */}
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Ionicons name="restaurant" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.brandTitleContainer}>
            <Text style={styles.brandTitle}>FOOD POS</Text>
            <Text style={styles.brandSubtitle}>RESTAURANT</Text>
          </View>
        </View>

        {/* Center: Date & Time Display */}
        <View style={styles.headerCenter}>
          <View style={styles.dateTimeBadge}>
            <Ionicons name="calendar-outline" size={17} color="#FF4D5E" />
            <Text style={styles.dateTimeText}>{currentDate}</Text>
            <View style={styles.dateTimeDivider} />
            <Ionicons name="time-outline" size={17} color="#FF4D5E" />
            <Text style={styles.dateTimeText}>{currentTime}</Text>
          </View>
        </View>

        {/* Right: User Avatar & Menu Button */}
        <View style={styles.headerRight}>
          <View style={styles.userInfo}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person-outline" size={18} color="#475569" />
            </View>
            <View style={styles.userTextContainer}>
              <Text style={styles.userName}>{user?.userName || "John Doe"}</Text>
              <Text style={styles.userRole}>{user?.role || "Cashier"}</Text>
            </View>
          </View>

          {/* Menu Button */}
          <TouchableOpacity
            style={[styles.menuButton, menuOpen && styles.menuButtonActive]}
            activeOpacity={0.8}
            onPress={() => setMenuOpen(!menuOpen)}
          >
            <Ionicons name={menuOpen ? "close-outline" : "menu-outline"} size={22} color="#FFFFFF" />
            <Text style={styles.menuButtonText}>Menu</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DROPDOWN MENU MODAL / OVERLAY */}
      {menuOpen && (
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={[styles.dropdownMenu, { top: insets.top + 65 }]}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => handleMenuNavigate("/general-settings")}
            >
              <Ionicons name="settings-outline" size={20} color="#475569" />
              <Text style={styles.dropdownItemText}>Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => handleMenuNavigate("/heldOrders")}
            >
              <Ionicons name="clipboard-outline" size={20} color="#475569" />
              <Text style={styles.dropdownItemText}>Orders</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                useOrderContextStore.getState().setOrderContext({ orderType: "DINE_IN" });
                handleMenuNavigate("/(tabs)/category");
              }}
            >
              <Ionicons name="grid-outline" size={20} color="#475569" />
              <Text style={styles.dropdownItemText}>Tables</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => handleMenuNavigate("/(tabs)/category")}
            >
              <Ionicons name="restaurant-outline" size={20} color="#475569" />
              <Text style={styles.dropdownItemText}>Menu Master</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => handleMenuNavigate("/sales-report")}
            >
              <Ionicons name="bar-chart-outline" size={20} color="#475569" />
              <Text style={styles.dropdownItemText}>Reports</Text>
            </TouchableOpacity>

            <View style={styles.dropdownDivider} />

            <TouchableOpacity
              style={[styles.dropdownItem, styles.dropdownItemLogout]}
              onPress={() => handleMenuNavigate("logout")}
            >
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={[styles.dropdownItemText, styles.logoutText]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {/* MAIN CONTENT AREA */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Soft background ambient overlay */}
        <Image
          source={{ uri: BG_PATTERN_IMG }}
          style={StyleSheet.absoluteFillObject}
          blurRadius={Platform.OS === "web" ? 14 : 8}
        />
        <View style={styles.bgOverlay} />

        {/* HERO TITLE SECTION */}
        <View style={styles.heroSection}>
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.mainTitle}>FOOD POS</Text>
          <Text style={styles.subTitle}>Please select an order type to continue</Text>
        </View>

        {/* CARDS CONTAINER */}
        <View style={[styles.cardsRow, !isLandscape && styles.cardsColumn]}>
          {/* CARD 1: DINE IN */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.92}
            onPress={handleDineIn}
          >
            <View style={styles.cardImageContainer}>
              <Image source={{ uri: DINE_IN_IMG }} style={styles.cardImage} />
              <View style={[styles.iconCircleBadge, { backgroundColor: "#FF4D5E" }]}>
                <Ionicons name="restaurant" size={26} color="#FFFFFF" />
              </View>
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>DINE IN</Text>
              <Text style={styles.cardSubtitle}>Serve customers at tables</Text>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#FF4D5E" }]}
                onPress={handleDineIn}
                activeOpacity={0.85}
              >
                <Text style={styles.actionButtonText}>Start Dine In</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          {/* CARD 2: TAKE AWAY */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.92}
            onPress={handleTakeAway}
          >
            <View style={styles.cardImageContainer}>
              <Image source={{ uri: TAKE_AWAY_IMG }} style={styles.cardImage} />
              <View style={[styles.iconCircleBadge, { backgroundColor: "#FF4D6D" }]}>
                <Ionicons name="bag-handle" size={26} color="#FFFFFF" />
              </View>
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>TAKE AWAY</Text>
              <Text style={styles.cardSubtitle}>Quick pickup orders</Text>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#FF9500" }]}
                onPress={handleTakeAway}
                activeOpacity={0.85}
              >
                <Text style={styles.actionButtonText}>Start Take Away</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          {/* CARD 3: QUICK SERVE */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.92}
            onPress={handleQuickServe}
          >
            <View style={styles.cardImageContainer}>
              <Image source={{ uri: QUICK_SERVE_IMG }} style={styles.cardImage} />
              <View style={[styles.iconCircleBadge, { backgroundColor: "#FF6B6B" }]}>
                <Ionicons name="timer-outline" size={28} color="#FFFFFF" />
              </View>
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>QUICK SERVE</Text>
              <Text style={styles.cardSubtitle}>Fast billing for walk-in customers</Text>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#22C55E" }]}
                onPress={handleQuickServe}
                activeOpacity={0.85}
              >
                <Text style={styles.actionButtonText}>Start Quick Serve</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    height: 66,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    zIndex: 100,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FF4D5E",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    elevation: 3,
    shadowColor: "#FF4D5E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  brandTitleContainer: {
    justifyContent: "center",
  },
  brandTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 19,
    color: "#0F172A",
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 9.5,
    color: "#64748B",
    letterSpacing: 1.6,
    marginTop: -2,
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
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dateTimeText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 13,
    color: "#334155",
    marginLeft: 6,
  },
  dateTimeDivider: {
    width: 1,
    height: 14,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 18,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  userTextContainer: {
    justifyContent: "center",
  },
  userName: {
    fontFamily: Fonts.bold || "System",
    fontSize: 13.5,
    color: "#1E293B",
  },
  userRole: {
    fontFamily: Fonts.regular || "System",
    fontSize: 11,
    color: "#64748B",
  },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF4D5E",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    elevation: 3,
    shadowColor: "#FF4D5E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  menuButtonActive: {
    backgroundColor: "#DC2626",
  },
  menuButtonText: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 14,
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
  dropdownMenu: {
    position: "absolute",
    right: 24,
    width: 230,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 8,
    elevation: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 12,
  },
  dropdownItemText: {
    fontFamily: Fonts.medium || "System",
    fontSize: 14,
    color: "#334155",
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 4,
  },
  dropdownItemLogout: {
    backgroundColor: "#FEF2F2",
  },
  logoutText: {
    color: "#EF4444",
    fontFamily: Fonts.semiBold || "System",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.90)",
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  welcomeText: {
    fontFamily: Fonts.medium || "System",
    fontSize: 24,
    color: "#334155",
    letterSpacing: 0.4,
  },
  mainTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 48,
    color: "#FF4D5E",
    letterSpacing: 1.5,
    marginTop: 2,
    marginBottom: 6,
  },
  subTitle: {
    fontFamily: Fonts.regular || "System",
    fontSize: 16.5,
    color: "#64748B",
  },
  cardsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "stretch",
    gap: 32,
    width: "100%",
    maxWidth: 1120,
  },
  cardsColumn: {
    flexDirection: "column",
    alignItems: "center",
  },
  card: {
    flex: 1,
    minWidth: 300,
    maxWidth: 350,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  cardImageContainer: {
    height: 190,
    width: "100%",
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  iconCircleBadge: {
    position: "absolute",
    bottom: -26,
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    elevation: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  cardContent: {
    paddingTop: 38,
    paddingBottom: 26,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  cardTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 21,
    color: "#0F172A",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontFamily: Fonts.regular || "System",
    fontSize: 14.5,
    color: "#64748B",
    marginBottom: 22,
    textAlign: "center",
  },
  actionButton: {
    width: "100%",
    height: 50,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  actionButtonText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 15.5,
    color: "#FFFFFF",
  },
});
