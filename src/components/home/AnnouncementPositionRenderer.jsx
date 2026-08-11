import AnnouncementTicker from "./AnnouncementTicker";
import AnnouncementModal from "./AnnouncementModal";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Filters announcements by:
 * - is_active
 * - display_position
 * - allowed_pages (empty = all pages)
 * - target_audience vs userRole
 * - not expired
 */
function filterAnnouncements(all, position, currentPageName, userRole) {
  const { can, isAdmin } = usePermissions();
  const now = new Date();
  return (all || []).filter(a => {
    if (!a.is_active) return false;
    if (a.display_position && a.display_position !== position) return false;

    // Page filter
    if (a.allowed_pages && a.allowed_pages.length > 0) {
      if (!a.allowed_pages.includes(currentPageName)) return false;
    }

    // Audience
    if (a.target_audience === "admins") {
      // const isAdmin = ["admin", "tenant_admin", "platform_admin", "ROLE_ADMIN"].includes(userRole);
      if (!isAdmin) return false;
    } else if (a.target_audience === "users") {
      if (userRole !== "user" && userRole !== 'ROLE_USER') {
        
        return false;
      }
    }

    // Expiry
    if (a.expires_at) {
      if (new Date(a.expires_at) < now) return false;
    }

    return true;
  });
}

/**
 * Renders announcements for a specific position.
 * position: "above_nav" | "below_nav" | "page_footer" | "modal"
 */
export default function AnnouncementPositionRenderer({ announcements, position, currentPageName, userRole }) {
  const filtered = filterAnnouncements(announcements, position, currentPageName, userRole);
  if (filtered.length === 0) return null;

  if (position === "modal") {
    return <AnnouncementModal announcements={filtered} />;
  }

  // Ticker bar for above_nav, below_nav, page_footer
  return <AnnouncementTicker announcements={filtered} />;
}