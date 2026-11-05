import express from "express";
import cors from "cors";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "invoices@cleoia.app";
const APP_URL = process.env.APP_URL || "https://yards.cleoia.app";
const LOGO_URL = `${APP_URL}/cleo-yards-logo.png`;

// FASE 4: facturación mensual automática
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const COMPANY_ID = process.env.COMPANY_ID || "00000000-0000-0000-0000-000000000001";
const BILLING_TIMEZONE = process.env.BILLING_TIMEZONE || "America/Chicago";
const CRON_SECRET = process.env.CRON_SECRET; // protege los endpoints de disparo manual
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

app.get("/health", (_, res) => res.json({ status: "ok", service: "cleo-yards-emails", billingEnabled: !!supabase }));

async function sendEmail({ to, subject, html, replyTo }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      reply_to: replyTo || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Resend error");
  return data;
}

const emailHeader = (companyName) => `
  <div style="text-align:center;padding:28px 24px 20px">
    <img src="${LOGO_URL}" width="52" height="52" alt="Cleo Yards" style="border-radius:12px;margin-bottom:10px"/>
    <div style="font-size:20px;font-weight:800;letter-spacing:-0.03em">
      <span style="color:#16A34A">cleo</span><span style="color:#4ADE80">yards</span>
    </div>
    <div style="width:60px;height:2px;border-radius:1px;background:linear-gradient(90deg,#16A34A,#4ADE80);margin:6px auto 0"></div>
    ${companyName ? `<div style="font-size:12px;color:#64748B;margin-top:8px;font-weight:500">${companyName}</div>` : ""}
  </div>`;

const emailFooter = (company) => `
  <div style="text-align:center;padding:20px 24px 8px">
    <div style="width:40px;height:1px;background:#E2E8F0;margin:0 auto 14px"></div>
    <p style="font-size:11px;color:#94A3B8;margin:0;line-height:1.6">
      ${company.name || "Cleo Yards"}${company.address ? ` · ${company.address}` : ""}
    </p>
    <p style="font-size:9px;color:#CBD5E1;margin:8px 0 0;letter-spacing:0.08em;text-transform:uppercase">Powered by Cleo Yards</p>
  </div>`;

function invoiceEmailHtml({ company, client, invoice, items, payUrl }) {
  const total = (invoice.total || 0).toFixed(2);
  const itemRows = (items || []).map(i =>
    `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A">${i.name}</td>
      <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:12px;color:#64748B;text-align:center">${i.qty || 1}</td>
      <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A;text-align:right;font-weight:600">$${((i.qty || 1) * (i.price || 0)).toFixed(2)}</td>
    </tr>`
  ).join("");

  const dueDateFmt = invoice.dueDate
    ? new Date(invoice.dueDate + "T12:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "upon receipt";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#ffffff;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden">
    ${emailHeader(company.name)}
    <div style="background:#16A34A;padding:24px;text-align:center;margin:0 20px;border-radius:12px">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">AMOUNT DUE</div>
      <div style="font-size:38px;font-weight:800;color:#fff;letter-spacing:-0.02em">$${total}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px">Due ${dueDateFmt}</div>
    </div>
    <div style="padding:20px 24px 0">
      <table style="width:100%;margin-bottom:12px">
        <tr>
          <td style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.06em;padding-bottom:4px">Invoice</td>
          <td style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.06em;padding-bottom:4px;text-align:right">Bill To</td>
        </tr>
        <tr>
          <td style="font-size:14px;font-weight:700;color:#0F172A;vertical-align:top">${invoice.invoiceNumber || ""}</td>
          <td style="font-size:13px;color:#0F172A;text-align:right;vertical-align:top;font-weight:600">${client.name || ""}</td>
        </tr>
        <tr>
          <td style="font-size:11px;color:#64748B">${new Date(invoice.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
          <td style="font-size:11px;color:#64748B;text-align:right">${client.email || ""}</td>
        </tr>
      </table>
    </div>
    <div style="padding:0 24px">
      <table style="width:100%;border-collapse:collapse">
        <tr style="border-bottom:2px solid #E2E8F0">
          <th style="padding:10px 0;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:left">Service</th>
          <th style="padding:10px 0;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:center;width:40px">Qty</th>
          <th style="padding:10px 0;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:right;width:80px">Amount</th>
        </tr>
        ${itemRows}
      </table>
      <div style="padding:12px 0;text-align:right;border-top:1px solid #E2E8F0">
        <div style="font-size:12px;color:#64748B">Subtotal: $${(invoice.subtotal || 0).toFixed(2)}</div>
        <div style="font-size:18px;font-weight:800;color:#0F172A;margin-top:6px">Total: $${total}</div>
      </div>
    </div>
    <div style="padding:8px 24px 28px;text-align:center">
      <a href="${payUrl}" style="display:inline-block;padding:14px 52px;background:#16A34A;color:#ffffff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none">
        Pay Now &mdash; $${total}
      </a>
      <p style="font-size:11px;color:#94A3B8;margin:12px 0 0">Pay via Zelle and upload your confirmation screenshot.</p>
    </div>
    ${emailFooter(company)}
  </div>
</div>
</body></html>`;
}

function jobCompleteEmailHtml({ company, client, job, services }) {
  const svcList = (services || []).map(s =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9">
      <table cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:8px;height:8px;border-radius:50%;background:#16A34A" width="8"></td>
        <td style="padding-left:10px;font-size:13px;color:#0F172A;font-weight:500">${s.name}</td>
      </tr></table>
    </td></tr>`
  ).join("");

  const jobDate = job.date
    ? new Date(job.date + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#ffffff;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden">
    ${emailHeader(company.name)}
    <div style="margin:0 20px;background:#F0FDF4;border:1px solid rgba(22,163,74,0.15);border-radius:12px;padding:20px;text-align:center">
      <div style="width:44px;height:44px;border-radius:50%;background:#16A34A;margin:0 auto 12px;line-height:44px;text-align:center">
        <span style="color:#fff;font-size:20px;font-weight:800">&#10003;</span>
      </div>
      <div style="font-size:18px;font-weight:800;color:#0F172A;margin-bottom:4px">Service Completed!</div>
      <div style="font-size:13px;color:#64748B">Hi ${client.name || "there"}, your service has been completed.</div>
    </div>
    <div style="padding:20px 24px">
      <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px">${jobDate}</div>
      <table style="width:100%;border-collapse:collapse">
        ${svcList}
      </table>
    </div>
    <div style="padding:0 24px 24px;text-align:center">
      <p style="font-size:13px;color:#64748B;margin:0;line-height:1.6">
        Thank you for choosing <strong style="color:#0F172A">${company.name || "us"}</strong>!<br/>
        We look forward to seeing you next time.
      </p>
    </div>
    ${emailFooter(company)}
  </div>
</div>
</body></html>`;
}

function reminderEmailHtml({ company, client, invoices }) {
  const total = invoices.reduce((s, i) => s + (i.total || 0), 0).toFixed(2);
  const rows = invoices.map(i => {
    const dueDateFmt = i.due_date
      ? new Date(i.due_date + "T12:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })
      : "";
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A">${i.invoice_number || ""}</td>
      <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:12px;color:#64748B">Due ${dueDateFmt}</td>
      <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A;text-align:right;font-weight:600">$${(i.total || 0).toFixed(2)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#ffffff;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden">
    ${emailHeader(company.name)}
    <div style="background:#F59E0B;padding:24px;text-align:center;margin:0 20px;border-radius:12px">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">PAYMENT REMINDER</div>
      <div style="font-size:34px;font-weight:800;color:#fff;letter-spacing:-0.02em">$${total}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.85);margin-top:4px">Outstanding balance</div>
    </div>
    <div style="padding:20px 24px 0">
      <p style="font-size:13px;color:#0F172A;margin:0 0 12px">Hi ${client.name || "there"}, this is a friendly reminder that the following invoice${invoices.length > 1 ? "s are" : " is"} still unpaid:</p>
      <table style="width:100%;border-collapse:collapse">
        <tr style="border-bottom:2px solid #E2E8F0">
          <th style="padding:8px 0;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:left">Invoice</th>
          <th style="padding:8px 0;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:left">Due</th>
          <th style="padding:8px 0;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:right">Amount</th>
        </tr>
        ${rows}
      </table>
    </div>
    <div style="padding:8px 24px 28px;text-align:center">
      <a href="${APP_URL}/pay/${invoices[0].id}" style="display:inline-block;padding:14px 52px;background:#16A34A;color:#ffffff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none">
        Pay Now
      </a>
      <p style="font-size:11px;color:#94A3B8;margin:12px 0 0">Pay via Zelle and upload your confirmation screenshot.</p>
    </div>
    ${emailFooter(company)}
  </div>
</div>
</body></html>`;
}

app.post("/api/emails/invoice", async (req, res) => {
  try {
    const { company, client, invoice, items } = req.body;
    if (!client?.email || !invoice?.id) return res.status(400).json({ error: "Missing client email or invoice" });
    const payUrl = `${APP_URL}/pay/${invoice.id}`;
    const html = invoiceEmailHtml({ company, client, invoice, items, payUrl });
    const result = await sendEmail({
      to: client.email,
      subject: `Invoice ${invoice.invoiceNumber || ""} — $${(invoice.total || 0).toFixed(2)} from ${company?.name || "Cleo Yards"}`,
      html,
      replyTo: company?.email,
    });
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error("Invoice email error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/emails/job-complete", async (req, res) => {
  try {
    const { company, client, job, services } = req.body;
    if (!client?.email) return res.status(400).json({ error: "Missing client email" });
    const html = jobCompleteEmailHtml({ company, client, job, services });
    const result = await sendEmail({
      to: client.email,
      subject: `Service Completed — ${company?.name || "Cleo Yards"}`,
      html,
      replyTo: company?.email,
    });
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error("Job email error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3002;

/* ══════════════════════════════════════════════════════════════
   FASE 4 — Facturación mensual automática
   Día 1 del mes: factura a todos los clientes "monthly" activos
   por su valor acordado (agreed_value). Vencimiento: día 8.
   Último día laborable del mes: recordatorio a quien no ha pagado.
   ══════════════════════════════════════════════════════════════ */

async function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const { data } = await supabase.from("invoices").select("invoice_number").ilike("invoice_number", `INV-${year}-%`);
  const nums = (data || []).map(i => parseInt((i.invoice_number || "").split("-")[2]) || 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `INV-${year}-${String(next).padStart(3, "0")}`;
}

// Formatea "hoy" en la zona horaria del negocio, sin depender del huso del server
function todayInTimezone(tz) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value;
  return { year: +get("year"), month: +get("month"), day: +get("day"), weekday: get("weekday"), dateStr: `${get("year")}-${get("month")}-${get("day")}` };
}

function isLastBusinessDayOfMonth({ year, month, day, weekday }) {
  if (weekday === "Sat" || weekday === "Sun") return false;
  const lastDayOfMonth = new Date(year, month, 0).getDate(); // día 0 del mes siguiente = último día de este mes
  for (let d = lastDayOfMonth; d > day; d--) {
    const wd = new Date(year, month - 1, d).toLocaleDateString("en-US", { weekday: "short" });
    if (wd !== "Sat" && wd !== "Sun") return false; // hay un día laborable después de "day" -> "day" no es el último
  }
  return true;
}

async function runMonthlyBilling({ dryRun = false, clientId = null } = {}) {
  if (!supabase) throw new Error("Supabase not configured");
  const today = todayInTimezone(BILLING_TIMEZONE);
  const dueDate = `${today.year}-${String(today.month).padStart(2, "0")}-08`;
  const monthName = new Date(today.year, today.month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  let q = supabase.from("clients")
    .select("*").eq("company_id", COMPANY_ID).eq("status", "active").eq("billing_type", "monthly");
  if (clientId) q = q.eq("id", clientId);
  const { data: clients, error } = await q;
  if (error) throw error;
  const monthStart = `${today.year}-${String(today.month).padStart(2, "0")}-01`;

  const { data: company } = await supabase.from("companies").select("*").eq("id", COMPANY_ID).single();

  const results = [];
  for (const client of clients || []) {
    const amount = Number(client.agreed_value || 0);
    if (amount <= 0) { results.push({ client: client.name, skipped: "no agreed_value set" }); continue; }

    // Idempotencia: si ya existe la factura de este mes para este cliente, no se repite
    const { data: existing } = await supabase.from("invoices").select("invoice_number")
      .eq("client_id", client.id).eq("notes", monthName + " services").gte("date", monthStart).limit(1);
    if (existing?.length) { results.push({ client: client.name, skipped: "already invoiced this month (" + existing[0].invoice_number + ")" }); continue; }

    if (dryRun) { results.push({ client: client.name, email: client.email, wouldInvoice: amount, dueDate }); continue; }

    let description = monthName + " service";
    const { data: csRows } = await supabase.from("client_services").select("service_id").eq("client_id", client.id);
    if (csRows?.length) {
      const { data: svcRows } = await supabase.from("services").select("name").in("id", csRows.map(r => r.service_id));
      if (svcRows?.length) description = svcRows.map(s => s.name).join(", ");
    }

    const invoiceNumber = await getNextInvoiceNumber();
    const { data: invoice, error: invErr } = await supabase.from("invoices").insert({
      client_id: client.id, invoice_number: invoiceNumber, date: today.dateStr, due_date: dueDate,
      status: "sent", sent_date: today.dateStr, subtotal: amount, total: amount,
      notes: monthName + " services", payment_method: client.payment_method, company_id: COMPANY_ID,
    }).select().single();
    if (invErr) { results.push({ client: client.name, error: invErr.message }); continue; }

    await supabase.from("invoice_items").insert([{ invoice_id: invoice.id, service_id: null, name: description, qty: 1, price: amount }]);

    if (client.email) {
      try {
        const html = invoiceEmailHtml({
          company: company || {}, client, invoice: { ...invoice, invoiceNumber },
          items: [{ name: description, qty: 1, price: amount }], payUrl: `${APP_URL}/pay/${invoice.id}`,
        });
        await sendEmail({ to: client.email, subject: `Invoice ${invoiceNumber} — $${amount.toFixed(2)} from ${company?.name || "Cleo Yards"}`, html, replyTo: company?.email });
      } catch (e) { results.push({ client: client.name, invoice: invoiceNumber, emailError: e.message }); continue; }
    }
    results.push({ client: client.name, invoice: invoiceNumber, amount });
  }
  return results;
}

async function runPaymentReminder({ dryRun = false } = {}) {
  if (!supabase) throw new Error("Supabase not configured");
  const today = todayInTimezone(BILLING_TIMEZONE);
  const monthStart = `${today.year}-${String(today.month).padStart(2, "0")}-01`;

  const { data: company } = await supabase.from("companies").select("*").eq("id", COMPANY_ID).single();
  const { data: unpaid, error } = await supabase.from("invoices")
    .select("*, clients(*)").eq("company_id", COMPANY_ID)
    .in("status", ["sent", "overdue", "partial"]).gte("date", monthStart);
  if (error) throw error;

  const byClient = {};
  for (const inv of unpaid || []) {
    if (!inv.clients?.email) continue;
    (byClient[inv.client_id] ||= { client: inv.clients, invoices: [] }).invoices.push(inv);
  }

  const results = [];
  for (const { client, invoices } of Object.values(byClient)) {
    try {
      const total = invoices.reduce((s, i) => s + (i.total || 0), 0);
      if (dryRun) { results.push({ client: client.name, email: client.email, wouldRemind: invoices.length, total }); continue; }
      const html = reminderEmailHtml({ company: company || {}, client, invoices });
      await sendEmail({ to: client.email, subject: `Payment Reminder — $${total.toFixed(2)} due to ${company?.name || "Cleo Yards"}`, html, replyTo: company?.email });
      results.push({ client: client.name, invoiceCount: invoices.length, total });
    } catch (e) { results.push({ client: client.name, error: e.message }); }
  }
  return results;
}

// Corre una vez al día; decide internamente si hoy toca facturar o recordar.
if (supabase) {
  cron.schedule("0 8 * * *", async () => {
    const today = todayInTimezone(BILLING_TIMEZONE);
    try {
      if (today.day === 1) {
        const r = await runMonthlyBilling();
        console.log("Monthly billing run:", JSON.stringify(r));
      } else if (isLastBusinessDayOfMonth(today)) {
        const r = await runPaymentReminder();
        console.log("Payment reminder run:", JSON.stringify(r));
      }
    } catch (e) { console.error("Cron run failed:", e); }
  }, { timezone: BILLING_TIMEZONE });
  console.log(`Billing cron scheduled daily at 08:00 (${BILLING_TIMEZONE})`);
} else {
  console.warn("SUPABASE_URL/SUPABASE_SERVICE_KEY not set — monthly billing cron is disabled.");
}

// Disparo manual (para pruebas, o por si algún día quieres un botón "Facturar ahora").
// Protegido con un secreto simple — nunca lo dejes sin CRON_SECRET en producción.
function requireCronSecret(req, res, next) {
  if (!CRON_SECRET) return res.status(503).json({ error: "CRON_SECRET not configured" });
  if (req.get("X-Cron-Secret") !== CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ?dryRun=1 -> solo lista a quién facturaría, sin crear facturas ni enviar correos
// ?clientId=<uuid> -> factura únicamente a ese cliente (ideal para la prueba piloto)
app.post("/api/cron/run-monthly-billing", requireCronSecret, async (req, res) => {
  try {
    const dryRun = req.query.dryRun === "1";
    const clientId = req.query.clientId || null;
    res.json({ success: true, dryRun, results: await runMonthlyBilling({ dryRun, clientId }) });
  }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post("/api/cron/run-payment-reminder", requireCronSecret, async (req, res) => {
  try {
    const dryRun = req.query.dryRun === "1";
    res.json({ success: true, dryRun, results: await runPaymentReminder({ dryRun }) });
  }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Cleo Yards Email Service running on :${PORT}`));
