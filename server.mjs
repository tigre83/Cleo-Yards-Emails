import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "invoices@cleoia.app";
const APP_URL = process.env.APP_URL || "https://yards.cleoia.app";
const LOGO_URL = `${APP_URL}/cleo-yards-logo.png`;

app.get("/health", (_, res) => res.json({ status: "ok", service: "cleo-yards-emails" }));

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
        <div style="font-size:12px;color:#64748B">Tax (${(invoice.taxRate || 6.25).toFixed(2)}%): $${(invoice.taxAmount || 0).toFixed(2)}</div>
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
app.listen(PORT, () => console.log(`Cleo Yards Email Service running on :${PORT}`));
