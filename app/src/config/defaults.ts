/**
 * Default values for the `system_config` table, seeded on first run.
 * Every one of these is editable at runtime from Admin → Settings —
 * no redeploy needed. Spec: 03-data-model.md § system_config.
 */
export const systemConfigDefaults: Record<string, unknown> = {
  org_name: "Pragati — Bengali Association of Greater Philadelphia",
  org_address: "127 Lotus Lane, Malvern, PA 19355",
  contact_email: "pragati.management@gmail.com",

  membership_annual_price_cents: 3500,
  member_discount_percent: 30,
  member_discount_mode: "per_adult", // per_adult | whole_family
  adult_age: 18,

  // ── membership ↔ registration coupling (the backdoor)
  //    honor  = trust "I'm already a member" claims at registration; give member
  //             pricing, save a member record, NO database/sign-in check.
  //    verify = require a real account / DB match (incl. multi-email lookup).
  //    This event runs on honor; flip to "verify" in Admin → Settings later.
  member_mode: "honor",

  active_event_slug: "durga-pujo-2026",

  // ── donations framing: generic | pujo (Pujo Sponsorship). Flip to "generic"
  //    after the festival to restore year-round giving + in-honor/in-memory.
  donation_mode: "pujo",

  // ── Zelle (TEST: Sayantan's email; switch to org email in Admin → Settings)
  zelle_recipient_email: "sayantankundu93@gmail.com",
  zelle_recipient_display_name: "Pragati",
  zelle_verification_sla_hours: 24,
  zelle_reservation_hours: 48,
  square_reservation_minutes: 15,

  system_email_from: "sayantankundu93@gmail.com", // TEST override; org email later
  system_email_reply_to: "sayantankundu93@gmail.com",
  treasurer_notification_email: "sayantankundu93@gmail.com",
  admin_alert_email: "sayantankundu93@gmail.com", // deletion & security alerts

  refund_cutoff_days: 0,

  // ── emergency kill-switches (flip in Admin → Settings, no redeploy)
  registration_paused: "no", // yes = stop new registrations site-wide
  registration_pause_message:
    "Online registration is briefly paused — please check back in a little while.",
  payments_square_enabled: "yes", // no = hide/refuse card payments (e.g. Square outage)
  payments_zelle_enabled: "no", // yes = also offer Zelle (card is always available); off by default

  // ── Zelle alert frequency: at most one treasurer alert email per this many
  //    minutes; claims arriving in between are batched into one digest.
  zelle_alert_minutes: 5,

  // ── email sending budget (per rolling 24h — protects free-tier limits;
  //    Brevo free = 300/day, so 280 leaves headroom. Critical mail like
  //    tickets always sends; see src/lib/email/index.ts)
  email_daily_budget: 280,

  // ── daily registration backup (CSV email — see src/lib/backup.ts)
  backup_email: "pragati.management@gmail.com",
  backup_enabled: "yes", // yes | no


  // ── food-scan color codes (shown full-screen at the serving line)
  food_color_veg: "#3E7C3A", // green
  food_color_non_veg: "#B3402A", // red-brown
  food_color_kid: "#2B6CB0", // blue

  magazine_purchase_note:
    "Magazines are sold at the Pujo event counter — not available online.",

  // Day-of kiosk
  dayof_enabled: true,
  dayof_idle_reset_seconds: 90,

  // ── home hero announcement banner (animated; Admin → Settings)
  home_banner_enabled: "yes", // yes = show the animated banner in the home hero
  home_banner_style: "aurora", // aurora | alpona | toran (three animated designs)
  home_banner_text: "Register soon — Early Bird pricing ends September 5.",
  // Blank by default: the hero already has a big Register button, so the banner
  // stays an announcement (the whole strip is clickable). Fill this in to add a
  // second, explicit button.
  home_banner_cta_label: "",
  home_banner_href: "/register",
  home_banner_deadline: "2026-09-05", // optional YYYY-MM-DD → live "N days left" chip (blank to hide)
};
