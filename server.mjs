import express from "express";
import cors from "cors";

/* ═══════════════════════════════════════════════════════════════
   CLEO YARDS — Email Backend (Railway)
   Endpoints:
   - POST /api/emails/invoice      → Send invoice email with Pay Now button
   - POST /api/emails/job-complete  → Send job completion notification
   - GET  /health                   → Health check
   ═══════════════════════════════════════════════════════════════ */

const app = express();
app.use(cors());
app.use(express.json());

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "invoices@cleoyards.app";
const APP_URL = process.env.APP_URL || "https://yards.cleoia.app";

// ── Health check
app.get("/health", (_, res) => res.json({ status: "ok", service: "cleo-yards-emails" }));

// ── Send Resend email helper
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

// ── Invoice Email Template
function invoiceEmailHtml({ company, client, invoice, items, payUrl }) {
  const total = (invoice.total || 0).toFixed(2);
  const itemRows = (items || []).map(i =>
    `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A">${i.name}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#64748B;text-align:center">${i.qty || 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A;text-align:right;font-weight:600">$${((i.qty || 1) * (i.price || 0)).toFixed(2)}</td>
    </tr>`
  ).join("");

  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0FDF4;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">

  <!-- Header -->
  <div style="background:#fff;border-radius:16px 16px 0 0;padding:24px;border:1px solid #E2E8F0;border-bottom:none;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:16px">
      ${company.logo ? `<img src="${company.logo}" width="36" height="36" style="border-radius:8px"/>` : ""}
      <span style="font-size:18px;font-weight:800;color:#0F172A">${company.name || "Cleo Yards"}</span>
    </div>
    <h1 style="font-size:22px;font-weight:800;color:#0F172A;margin:0 0 4px">Invoice ${invoice.invoiceNumber || ""}</h1>
    <p style="font-size:13px;color:#64748B;margin:0">
      Due ${invoice.dueDate ? new Date(invoice.dueDate + "T12:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "upon receipt"}
    </p>
  </div>

  <!-- Amount -->
  <div style="background:#16A34A;padding:28px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">AMOUNT DUE</div>
    <div style="font-size:36px;font-weight:800;color:#fff;letter-spacing:-0.02em">$${total}</div>
  </div>

  <!-- Items -->
  <div style="background:#fff;padding:0 24px;border:1px solid #E2E8F0;border-top:none;border-bottom:none">
    <table style="width:100%;border-collapse:collapse">
      <tr style="border-bottom:2px solid #E2E8F0">
        <th style="padding:14px 12px;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:left">Service</th>
        <th style="padding:14px 8px;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:center;width:40px">Qty</th>
        <th style="padding:14px 12px;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;text-align:right;width:80px">Amount</th>
      </tr>
      ${itemRows}
    </table>
    <div style="padding:14px 12px;text-align:right">
      <span style="font-size:12px;color:#64748B">Subtotal: $${(invoice.subtotal || 0).toFixed(2)}</span><br/>
      <span style="font-size:12px;color:#64748B">Tax (${(invoice.taxRate || 6.25).toFixed(2)}%): $${(invoice.taxAmount || 0).toFixed(2)}</span><br/>
      <span style="font-size:16px;font-weight:800;color:#0F172A;margin-top:6px;display:inline-block">Total: $${total}</span>
    </div>
  </div>

  <!-- Pay Button -->
  <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;border:1px solid #E2E8F0;border-top:none;text-align:center">
    <a href="${payUrl}" style="display:inline-block;padding:14px 48px;background:#16A34A;color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:0.01em">
      Pay Now — $${total}
    </a>
    <p style="font-size:11px;color:#94A3B8;margin:14px 0 0">Pay via Zelle and upload your confirmation screenshot.</p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:24px 0 12px">
    <p style="font-size:11px;color:#94A3B8;margin:0">${company.name || "Cleo Yards"} · ${company.address || ""}</p>
    <p style="font-size:10px;color:#C4C4C4;margin:6px 0 0">Powered by Cleo Yards · yards.cleoia.app</p>
  </div>
</div>
</body></html>`;
}

// ── Job Complete Email Template
function jobCompleteEmailHtml({ company, client, job, services }) {
  const svcList = (services || []).map(s =>
    `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #F1F5F9">
      <div style="width:6px;height:6px;border-radius:50%;background:#16A34A;flex-shrink:0"></div>
      <span style="font-size:13px;color:#0F172A">${s.name}</span>
    </div>`
  ).join("");

  const jobDate = job.date ? new Date(job.date + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";

  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0FDF4;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">

  <div style="background:#fff;border-radius:16px;padding:28px 24px;border:1px solid #E2E8F0;text-align:center">
    <div style="width:48px;height:48px;border-radius:50%;background:#DCFCE7;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px">
      <span style="font-size:22px">✅</span>
    </div>
    <h1 style="font-size:20px;font-weight:800;color:#0F172A;margin:0 0 6px">Service Completed!</h1>
    <p style="font-size:13px;color:#64748B;margin:0">Hi ${client.name || "there"}, your service has been completed.</p>

    <div style="background:#F8FAFC;border-radius:10px;padding:16px;margin:20px 0;text-align:left">
      <div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">${jobDate}</div>
      ${svcList}
    </div>

    <p style="font-size:12px;color:#64748B;margin:0">Thank you for choosing ${company.name || "us"}! We look forward to seeing you next time.</p>
  </div>

  <div style="text-align:center;padding:20px 0 12px">
    <p style="font-size:11px;color:#94A3B8;margin:0">${company.name || "Cleo Yards"} · ${company.address || ""}</p>
    <p style="font-size:10px;color:#C4C4C4;margin:6px 0 0">Powered by Cleo Yards · yards.cleoia.app</p>
  </div>
</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// POST /api/emails/invoice
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

// POST /api/emails/job-complete
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
app.listen(PORT, () => console.log(`Cleo Yards Email Service running on :${PORT}`));
