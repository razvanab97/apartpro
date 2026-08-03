import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3000";
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const testEmail = `test-txnfix-${Date.now()}@exemplu.ro`;
const testPassword = "Parola-Test-1!";
let createdUserId = null;

async function main() {
  const before = await supabaseAdmin
    .from("properties")
    .select("transaction_type", { count: "exact", head: true })
    .eq("listing_source_id", "538de3f0-ddaf-475d-8a2c-541b361b961b")
    .eq("transaction_type", "inchiriere");
  console.log("ÎNAINTE — proprietăți inchiriere din această sursă:", before.count);

  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: { full_name: "Test TxnFix" },
  });
  createdUserId = created.user.id;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE}/agent`);
  await page.waitForTimeout(1000);
  await page.fill('input[name="email"]', testEmail);
  await page.fill('input[name="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  await page.goto(`${BASE}/monitorizare`);
  await page.waitForTimeout(1500);
  // Găsim rândul cu URL-ul sursei și apăsăm "Sincronizează" pentru el.
  const row = page.locator("tr", { hasText: "FV1mbwGF" });
  await row.locator('button:has-text("Sincronizează")').click();
  await page.waitForTimeout(3000);
  console.log("URL după sincronizare:", page.url());

  // Așteptăm finalizarea job-ului pus la coadă de acel buton.
  for (let i = 0; i < 20; i++) {
    const { data: jobs } = await supabaseAdmin
      .from("link_sync_jobs")
      .select("status")
      .ilike("url", "%FV1mbwGF%")
      .order("created_at", { ascending: false })
      .limit(1);
    if (jobs?.[0] && (jobs[0].status === "done" || jobs[0].status === "error")) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 1500));

  const after = await supabaseAdmin
    .from("properties")
    .select("transaction_type", { count: "exact", head: true })
    .eq("listing_source_id", "538de3f0-ddaf-475d-8a2c-541b361b961b")
    .eq("transaction_type", "inchiriere");
  console.log("DUPĂ — proprietăți inchiriere din această sursă (ar trebui ~50):", after.count);

  await browser.close();
}

main()
  .catch((err) => console.error("EROARE:", err))
  .finally(async () => {
    if (createdUserId) await supabaseAdmin.auth.admin.deleteUser(createdUserId);
  });
