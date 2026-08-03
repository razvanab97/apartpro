import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3000";
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const testEmail = `test-trigger-${Date.now()}@exemplu.ro`;
const testPassword = "Parola-Test-1!";
let createdUserId = null;

async function main() {
  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: { full_name: "Test Trigger Visit" },
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

  await page.goto(`${BASE}/monitorizare`, { timeout: 120000 });
  console.log("Vizitat /monitorizare — job declanșat în fundal.");

  await browser.close();
}

main()
  .catch((err) => console.error("EROARE:", err))
  .finally(async () => {
    if (createdUserId) await supabaseAdmin.auth.admin.deleteUser(createdUserId);
  });
