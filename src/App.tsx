import { useState, useCallback, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { RadioProvider } from "@/contexts/RadioContext";
import { TenantProvider } from "@/contexts/TenantContext";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import SplashScreen from "@/components/SplashScreen";
import PageTracker from "@/components/PageTracker";
import OnboardingGate from "@/components/OnboardingGate";
import ReferralCapture from "@/components/ReferralCapture";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import PresenceTracker from "@/components/PresenceTracker";
import StellaVoiceAgentWrapper from "@/components/stella/StellaVoiceAgentWrapper";
import { CallProvider } from "@/contexts/CallContext";
import CallManager from "@/components/calls/CallManager";
import { initGlobalErrorHandler } from "@/lib/errorLogger";
import { Loader2 } from "lucide-react";
import { SpeedInsights } from "@vercel/speed-insights/react";

initGlobalErrorHandler();

// Lazy load all pages
const HomePage = lazy(() => import("./pages/HomePage"));
const LiveStreamPage = lazy(() => import("./pages/LiveStreamPage"));
const RadioPage = lazy(() => import("./pages/RadioPage"));
const ShopPage = lazy(() => import("./pages/ShopPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const WelcomeOnboardingPage = lazy(() => import("./pages/WelcomeOnboardingPage"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const BookingDetailPage = lazy(() => import("./pages/BookingDetailPage"));
const MyBookingsPage = lazy(() => import("./pages/MyBookingsPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const CreatePostPage = lazy(() => import("./pages/CreatePostPage"));
const StylistsPage = lazy(() => import("./pages/StylistsPage"));
const StylistDetailPage = lazy(() => import("./pages/StylistDetailPage"));
const ServiceDetailPage = lazy(() => import("./pages/ServiceDetailPage"));
const BusinessProfilePage = lazy(() => import("./pages/BusinessProfilePage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const EditProfilePage = lazy(() => import("./pages/EditProfilePage"));
const BeforeAfterPage = lazy(() => import("./pages/BeforeAfterPage"));
const QRCoinsPage = lazy(() => import("./pages/QRCoinsPage"));
const ChallengesPage = lazy(() => import("./pages/ChallengesPage"));
const SpinWheelPage = lazy(() => import("./pages/SpinWheelPage"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage"));
const BusinessDashboardPage = lazy(() => import("./pages/BusinessDashboardPage"));
const HRPage = lazy(() => import("./pages/HRPage"));
const CreateJobPostPage = lazy(() => import("./pages/CreateJobPostPage"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const MapSearchPage = lazy(() => import("./pages/MapSearchPage"));
const HomeServicePage = lazy(() => import("./pages/HomeServicePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const CallAutoAnswerSettingsPage = lazy(() => import("./pages/CallAutoAnswerSettingsPage"));
const ChatSecretarySettingsPage = lazy(() => import("./pages/ChatSecretarySettingsPage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const ReferralPage = lazy(() => import("./pages/ReferralPage"));
const AnalyticsDashboardPage = lazy(() => import("./pages/AnalyticsDashboardPage"));
const InstallmentsPage = lazy(() => import("./pages/InstallmentsPage"));
const PurchaseHistoryPage = lazy(() => import("./pages/PurchaseHistoryPage"));
const MissionsPage = lazy(() => import("./pages/MissionsPage"));
const AIAssistantPage = lazy(() => import("./pages/AIAssistantPage"));
const ShortsPage = lazy(() => import("./pages/ShortsPage"));
const GoLivePage = lazy(() => import("./pages/GoLivePage"));
const TransformationChallengePage = lazy(() => import("./pages/TransformationChallengePage"));
const LiveBattlePage = lazy(() => import("./pages/LiveBattlePage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const ExplorePage = lazy(() => import("./pages/ExplorePage"));
const ManageProductsPage = lazy(() => import("./pages/ManageProductsPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const CreatorApplicationPage = lazy(() => import("./pages/CreatorApplicationPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const BoostProfilePage = lazy(() => import("./pages/BoostProfilePage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const CreateServiceRequestPage = lazy(() => import("./pages/CreateServiceRequestPage"));
const CreateCastingPage = lazy(() => import("./pages/CreateCastingPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const ReceiptsPage = lazy(() => import("./pages/ReceiptsPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const VerifyAccountPage = lazy(() => import("./pages/VerifyAccountPage"));
const RemindersPage = lazy(() => import("./pages/RemindersPage"));
const SpaTermePage = lazy(() => import("./pages/SpaTermePage"));
const QuizLivePage = lazy(() => import("./pages/QuizLivePage"));
const TalentGamePage = lazy(() => import("./pages/TalentGamePage"));
const BusinessTeamPage = lazy(() => import("./pages/BusinessTeamPage"));
const EmployeeShiftsPage = lazy(() => import("./pages/EmployeeShiftsPage"));
const EmployeeActivityPage = lazy(() => import("./pages/EmployeeActivityPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AcademyPage = lazy(() => import("./pages/AcademyPage"));
const CourseDetailPage = lazy(() => import("./pages/CourseDetailPage"));
const CreateCoursePage = lazy(() => import("./pages/CreateCoursePage"));
const AdsManagerPage = lazy(() => import("./pages/AdsManagerPage"));
const MarketingCampaignPage = lazy(() => import("./pages/MarketingCampaignPage"));
const ShippingManagerPage = lazy(() => import("./pages/ShippingManagerPage"));
const CompleteProfilePage = lazy(() => import("./pages/CompleteProfilePage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const DebugPanelPage = lazy(() => import("./pages/DebugPanelPage"));
const AILookGeneratorPage = lazy(() => import("./pages/AILookGeneratorPage"));
const OffersPage = lazy(() => import("./pages/OffersPage"));
const AuctionsPage = lazy(() => import("./pages/AuctionsPage"));
const AffiliatePage = lazy(() => import("./pages/AffiliatePage"));
const ProfessionalDashboardPage = lazy(() => import("./pages/ProfessionalDashboardPage"));
const AIPreviewPage = lazy(() => import("./pages/AIPreviewPage"));
const TenantDashboardPage = lazy(() => import("./pages/TenantDashboardPage"));
const ContentCalendarPage = lazy(() => import("./pages/ContentCalendarPage"));
const PredictiveAnalyticsPage = lazy(() => import("./pages/PredictiveAnalyticsPage"));
const SocialAutomationPage = lazy(() => import("./pages/SocialAutomationPage"));
const WebsiteGeneratorPage = lazy(() => import("./pages/WebsiteGeneratorPage"));
const WhiteLabelPage = lazy(() => import("./pages/WhiteLabelPage"));
const GlobalSettingsPage = lazy(() => import("./pages/GlobalSettingsPage"));
const EnterpriseAPIPage = lazy(() => import("./pages/EnterpriseAPIPage"));

const queryClient = new QueryClient();

const P = ({ children }: { children: React.ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

const WelcomeGate = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (location.pathname !== "/") return;
    try {
      const done = localStorage.getItem("stayle_welcome_completed");
      if (!done) navigate("/welcome", { replace: true });
    } catch { /* best-effort, ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  return <>{children}</>;
};

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 text-primary animate-spin" />
  </div>
);

const App = () => {
  const [showSplash, setShowSplash] = useState(false);
  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);
  return (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PWAInstallPrompt />
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
        <CallProvider>
        <TenantProvider>
        <RadioProvider>
          <PageTracker />
          <OnboardingGate />
          <ReferralCapture />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<WelcomeGate><HomePage /></WelcomeGate>} />
            <Route path="/index" element={<Navigate to="/" replace />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/welcome" element={<WelcomeOnboardingPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/stylists" element={<StylistsPage />} />
            <Route path="/stylist/:id" element={<StylistDetailPage />} />
            <Route path="/service/:id" element={<ServiceDetailPage />} />
            <Route path="/business/:id" element={<BusinessProfilePage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/live" element={<LiveStreamPage />} />
            <Route path="/radio" element={<RadioPage />} />
            <Route path="/shorts" element={<ShortsPage />} />
            <Route path="/map-search" element={<MapSearchPage />} />
            <Route path="/spa-terme" element={<SpaTermePage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />

            {/* Protected routes */}
            <Route path="/profile" element={<P><ProfilePage /></P>} />
            <Route path="/profile/:id" element={<P><ProfilePage /></P>} />
            <Route path="/profile/edit" element={<P><EditProfilePage /></P>} />
            <Route path="/booking" element={<P><BookingPage /></P>} />
            <Route path="/booking/:id" element={<P><BookingPage /></P>} />
            <Route path="/my-bookings" element={<P><MyBookingsPage /></P>} />
            <Route path="/my-bookings/:id" element={<P><BookingDetailPage /></P>} />
            <Route path="/my-bookings/:id/review" element={<P><ReviewPage /></P>} />
            <Route path="/events" element={<P><EventsPage /></P>} />
            <Route path="/create-post" element={<P><CreatePostPage /></P>} />
            <Route path="/chat" element={<P><ChatPage /></P>} />
            <Route path="/chat/:id" element={<P><ChatPage /></P>} />
            <Route path="/notifications" element={<P><NotificationsPage /></P>} />
            <Route path="/before-after" element={<P><BeforeAfterPage /></P>} />
            <Route path="/home-service/:id" element={<P><HomeServicePage /></P>} />
            <Route path="/settings" element={<P><SettingsPage /></P>} />
            <Route path="/call-auto-answer" element={<P><CallAutoAnswerSettingsPage /></P>} />
            <Route path="/chat-secretary" element={<P><ChatSecretarySettingsPage /></P>} />
            <Route path="/referral" element={<P><ReferralPage /></P>} />
            <Route path="/analytics" element={<P><AnalyticsDashboardPage /></P>} />
            <Route path="/installments" element={<P><InstallmentsPage /></P>} />
            <Route path="/purchases" element={<P><PurchaseHistoryPage /></P>} />
            <Route path="/qr-coins" element={<P><QRCoinsPage /></P>} />
            <Route path="/challenges" element={<P><ChallengesPage /></P>} />
            <Route path="/spin" element={<P><SpinWheelPage /></P>} />
            <Route path="/leaderboard" element={<P><LeaderboardPage /></P>} />
            <Route path="/missions" element={<P><MissionsPage /></P>} />
            <Route path="/reminders" element={<P><RemindersPage /></P>} />
            <Route path="/ai-assistant" element={<P><AIAssistantPage /></P>} />
            <Route path="/go-live" element={<P><GoLivePage /></P>} />
            <Route path="/transformation-challenge" element={<P><TransformationChallengePage /></P>} />
            <Route path="/live-battle" element={<P><LiveBattlePage /></P>} />
            <Route path="/quiz-live" element={<P><QuizLivePage /></P>} />
            <Route path="/talent-game" element={<P><TalentGamePage /></P>} />
            <Route path="/manage-products" element={<P><ManageProductsPage /></P>} />
            <Route path="/wallet" element={<P><WalletPage /></P>} />
            <Route path="/admin" element={<P><AdminPage /></P>} />
            <Route path="/subscriptions" element={<P><SubscriptionPage /></P>} />
            <Route path="/boost" element={<P><BoostProfilePage /></P>} />
            <Route path="/become-creator" element={<P><CreatorApplicationPage /></P>} />
            <Route path="/marketplace" element={<P><MarketplacePage /></P>} />
            <Route path="/marketplace/create-request" element={<P><CreateServiceRequestPage /></P>} />
            <Route path="/marketplace/create-casting" element={<P><CreateCastingPage /></P>} />
            <Route path="/checkout" element={<P><CheckoutPage /></P>} />
            <Route path="/receipts" element={<P><ReceiptsPage /></P>} />
            <Route path="/verify-account" element={<P><VerifyAccountPage /></P>} />
            {/* Business & HR */}
            <Route path="/business" element={<P><BusinessDashboardPage /></P>} />
            <Route path="/business/team" element={<P><BusinessTeamPage /></P>} />
            <Route path="/business/team/invite" element={<P><BusinessTeamPage /></P>} />
            <Route path="/business/team/shifts" element={<P><EmployeeShiftsPage /></P>} />
            <Route path="/business/team/activity" element={<P><EmployeeActivityPage /></P>} />
            <Route path="/hr" element={<P><HRPage /></P>} />
            <Route path="/hr/create-job" element={<P><CreateJobPostPage /></P>} />
            <Route path="/hr/job/:id" element={<P><JobDetailPage /></P>} />
            <Route path="/hr/job/:id/manage" element={<P><JobDetailPage /></P>} />
            <Route path="/hr/application/:id" element={<P><HRPage /></P>} />
            <Route path="/ai-look" element={<P><AILookGeneratorPage /></P>} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/auctions" element={<AuctionsPage />} />
            <Route path="/affiliate" element={<P><AffiliatePage /></P>} />
            <Route path="/professional-dashboard" element={<P><ProfessionalDashboardPage /></P>} />
            <Route path="/ai-preview" element={<P><AIPreviewPage /></P>} />
            <Route path="/ai-preview/:sector" element={<P><AIPreviewPage /></P>} />
            <Route path="/content-calendar" element={<P><ContentCalendarPage /></P>} />
            <Route path="/predictive-analytics" element={<P><PredictiveAnalyticsPage /></P>} />
            <Route path="/social-automation" element={<P><SocialAutomationPage /></P>} />
            <Route path="/website-generator" element={<P><WebsiteGeneratorPage /></P>} />
            <Route path="/white-label" element={<P><WhiteLabelPage /></P>} />
            <Route path="/global-settings" element={<P><GlobalSettingsPage /></P>} />
            <Route path="/enterprise-api" element={<P><EnterpriseAPIPage /></P>} />
            <Route path="/tenant" element={<P><TenantDashboardPage /></P>} />
            <Route path="/debug" element={<P><DebugPanelPage /></P>} />
            <Route path="/complete-profile" element={<P><CompleteProfilePage /></P>} />
            <Route path="/academy" element={<P><AcademyPage /></P>} />
            <Route path="/academy/create" element={<P><CreateCoursePage /></P>} />
            <Route path="/academy/:id" element={<P><CourseDetailPage /></P>} />
            <Route path="/ads-manager" element={<P><AdsManagerPage /></P>} />
            <Route path="/marketing" element={<P><MarketingCampaignPage /></P>} />
            <Route path="/shipping" element={<P><ShippingManagerPage /></P>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </RadioProvider>
        </TenantProvider>
        <PresenceTracker />
        <StellaVoiceAgentWrapper />
        <CallManager />
        </CallProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  <SpeedInsights />
  </ErrorBoundary>
  );
};

export default App;
