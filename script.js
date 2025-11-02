/* script.js - النسخة المحدثة */
let merged = [];
let branchInfo = [];

// تحميل معلومات الفروع من JSON
fetch("information.json")
   .then((r) => r.json())
   .then((data) => {
      branchInfo = data["ورقة1"] || [];
   })
   .catch((e) => console.error("❌ خطأ في تحميل information.json:", e));

document.getElementById("analyze-btn").addEventListener("click", () => {
   const text = document.getElementById("visa-text").value;

   if (!text.trim()) {
      alert("الرجاء إدخال محتوى التقرير");
      return;
   }

   const raw = parseMerchantReport(text);
   merged = mergeTerminals(raw);
   renderTotalsTable(merged);

   const select = document.getElementById("terminal-select");
   select.innerHTML = "";
   populateTerminalSelect(merged);
});

/* ======================
   دالة تحليل التقرير (محسّنة — تتعامل مع Total في سطور متفرقة)
   ====================== */
function parseMerchantReport(text) {
   const terminals = [];
   const terminalBlocks = text.split(/Terminal ID:/).slice(1);

   terminalBlocks.forEach((block) => {
      const lines = block
         .replace(/\r/g, "")
         .split("\n")
         .map((l) => l.trim())
         .filter(Boolean);

      const terminalId = lines[0].trim();
      const transactions = [];
      let totalGross = null,
         totalNet = null;

      for (let i = 0; i < lines.length; i++) {
         const line = lines[i];

         // استخراج بطاقة وآخر أربع أرقام
         const cardMatch = line.match(/\*{6}(\d{4})/);
         // استخراج القيمة net من صف العمليات (pattern like "5.554-0.068 5.625")
         const netMatch = line.match(/\b\d+\.\d+-\d+\.\d+\s+(\d+\.\d+)\b/);

         if (cardMatch && netMatch) {
            transactions.push({
               cardNumber: cardMatch[1],
               amount: parseFloat(netMatch[1]),
            });
         }

         // البحث الذكي عن كتلة Total (تتعامل مع أسطر بعد Total)
         if (/^Total\b/i.test(line) || /^Total\s*/i.test(line)) {
            let collectedNumbers = [];
            let foundNetExplicit = null;

            // نجمع حتى 6 أسطر بعد كلمة Total (مرنة)
            for (let k = i; k < i + 7 && k < lines.length; k++) {
               const nums = lines[k].match(/(\d+\.\d+)/g);
               if (nums) collectedNumbers.push(...nums);

               const netLine = lines[k].match(/\bNet\b\s*[:\-\s]*([\d.]+)/i);
               if (netLine) foundNetExplicit = parseFloat(netLine[1]);
            }

            if (collectedNumbers.length >= 2) {
               const gross = parseFloat(collectedNumbers[0]);
               // محاولات متعددة لاستخراج net:
               let net =
                  foundNetExplicit ??
                  parseFloat(collectedNumbers[collectedNumbers.length - 1]);

               // تجنّب حالات التقاط أرقام صغيرة جداً (مثلاً 3.390 كقيمة مُنتقلة)
               // نضمن أن net ليست عدداً صغيراً جداً مقارنةً بـ gross
               if (gross && net && net <= gross * 1.2 && net >= gross * 0.2) {
                  totalGross = gross;
                  totalNet = net;
               }
            } else if (collectedNumbers.length === 1 && foundNetExplicit) {
               // حالة نادرة: gross في رقم واحد في مكان آخر، net مكتوب صراحة
               totalNet = foundNetExplicit;
            }
         }
      }

      terminals.push({
         terminalId,
         total: { gross: totalGross, net: totalNet },
         transactions,
      });
   });

   return terminals;
}

/* ======================
   دمج المحطات (لا نغيّر منطق الحساب السابق)
   ====================== */
function mergeTerminals(terminals) {
   const merged = {};

   terminals.forEach((item) => {
      const id = item.terminalId;
      if (!merged[id]) {
         merged[id] = {
            terminalId: id,
            transactions: [],
            total: { gross: 0, net: 0 },
         };
      }

      merged[id].transactions.push(...item.transactions);

      if (item.total?.gross) merged[id].total.gross = item.total.gross;
      if (item.total?.net) merged[id].total.net = item.total.net;
   });

   // إذا أردت حساب يدوي كاحتياط: لا نضعه تلقائياً (حتى لا يعطل وجود إجماليات رسمية)
   // لكن إن لم توجد إجماليات في التقرير يمكنك تفعيل السطرين التاليين يدوياً:
   /*
  Object.values(merged).forEach((item) => {
    if ((!item.total.gross || !item.total.net) && item.transactions.length) {
      const sum = item.transactions.reduce((s, t) => s + t.amount, 0);
      item.total.gross = item.total.gross || parseFloat(sum.toFixed(3));
      item.total.net = item.total.net || parseFloat(sum.toFixed(3));
    }
  });
  */

   return Object.values(merged);
}

/* ======================
   عرض النتائج (جدول الفروع) + تفاصيل منسدلة
   ====================== */
function renderTotalsTable(data) {
   const tbody = document.getElementById("totals-body");
   tbody.innerHTML = "";

   data.forEach((item) => {
      const id = item.terminalId;
      const gross =
         item.total.gross != null ? item.total.gross.toFixed(3) : "-";
      const net = item.total.net != null ? item.total.net.toFixed(3) : "-";
      const diff =
         item.total.gross != null && item.total.net != null
            ? (item.total.gross - item.total.net).toFixed(3)
            : "-";

      const branch = branchInfo.find(
         (b) => String(b["Terminal ID"]).slice(-4) === String(id).slice(-4)
      ) || {
         name: "غير معروف",
         "account id": "-",
         "bank account": "-",
      };

      const trMain = document.createElement("tr");
      trMain.innerHTML = `
      <td>${branch.name}</td>
      <td>${id}</td>
      <td>${branch["account id"]}</td>
      <td><button class="toggle-btn">⬇️</button></td>
    `;

      const trDetails = document.createElement("tr");
      trDetails.classList.add("details-row");
      trDetails.style.display = "none";

      const detailsTable = `
      <table class="inner-table" border="1">
        <tr>
          <td>${net}</td>
          <td>0</td>
          <td>${branch["bank account"]}</td>
        </tr>
        <tr>
          <td>${diff}</td>
          <td>0</td>
          <td>52121 - مصاريف عمولة فيزا كارد (عمان)</td>
        </tr>
        <tr>
        <td>0</td>
          <td>${gross}</td>
          <td>${branch["account id"]}</td>
        </tr>
      </table>
    `;
      const tdDetails = document.createElement("td");
      tdDetails.colSpan = 4;
      tdDetails.innerHTML = detailsTable;
      trDetails.appendChild(tdDetails);

      const btn = trMain.querySelector(".toggle-btn");
      btn.addEventListener("click", () => {
         const isOpen = trDetails.style.display === "table-row";
         trDetails.style.display = isOpen ? "none" : "table-row";
         btn.classList.toggle("rotate", !isOpen);
      });

      tbody.appendChild(trMain);
      tbody.appendChild(trDetails);
   });
}

/* ======================
   تعبئة قائمة Terminal select - نعرض اسم الفرع بدل الرقم
   ====================== */
function populateTerminalSelect(data) {
   const select = document.getElementById("terminal-select");
   select.innerHTML = "";
   data.forEach((item) => {
      const id = item.terminalId;
      const branch =
         branchInfo.find(
            (b) => String(b["Terminal ID"]).slice(-4) === String(id).slice(-4)
         ) || {};
      const text = branch.name ? `${branch.name} — (${id})` : id;
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = text;
      select.appendChild(opt);
   });
}

/* ======================
   قراءة الفواتير (robust) - تتعرف على رقم الفاتورة، القيمة، ورقم البطاقة
   الصيغة المقبولة: `202511185 9 رقم البطاقة : 8081`
   أو تفصيلًا: id وamount على سطر، و"رقم البطاقة" في نفس السطر أو بالأسطر التالية
   ====================== */
function parseInvoices(text) {
   const lines = text
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim());
   const invoices = [];

   // 1) نمط كامل في سطر واحد:
   const singleLineRegex =
      /^(\d{6,})\s+([\d.]+)\s*(?:[^\d\n]*?رقم البطاقة\s*[:：]?\s*(\d{3,4}))?/i;

   for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      let m = L.match(singleLineRegex);
      if (m) {
         const invId = m[1];
         const amount = parseFloat(m[2]);
         const card = m[3] ? m[3] : null;

         // إذا لم يوجد رقم البطاقة، نبحث في الأسطر التالية القليلة عن "رقم البطاقة"
         let cardSearching = card;
         if (!cardSearching) {
            for (let k = i + 1; k <= i + 3 && k < lines.length; k++) {
               const m2 = lines[k].match(/رقم البطاقة\s*[:：]?\s*(\d{3,4})/i);
               if (m2) {
                  cardSearching = m2[1];
                  break;
               }
            }
         }

         invoices.push({
            invoiceId: invId,
            amount,
            cardNumber: cardSearching,
         });
         continue;
      }

      // 2) نمط مفكك: سطر يحتمل أن يكون "id amount" ولكن بدون "رقم البطاقة" في نفس السطر
      const alt = L.match(/^(\d{6,})\s+([\d.]+)\s*$/);
      if (alt) {
         const invId = alt[1];
         const amount = parseFloat(alt[2]);
         // جرب العثور على رقم البطاقة في الأسطر التالية
         let cardFound = null;
         for (let k = i + 1; k <= i + 4 && k < lines.length; k++) {
            const m2 = lines[k].match(/رقم البطاقة\s*[:：]?\s*(\d{3,4})/i);
            if (m2) {
               cardFound = m2[1];
               break;
            }
         }
         invoices.push({
            invoiceId: invId,
            amount,
            cardNumber: cardFound,
         });
      }
   }

   // أخيراً: إذا لم نقرأ أي فاتورة، حاول استخراج أي أزواج رقمية قد تكون مدفونة
   if (invoices.length === 0) {
      const allMatches = text.match(/(\d{6,})\s+([\d.]+)/g);
      if (allMatches) {
         allMatches.forEach((t) => {
            const parts = t.split(/\s+/);
            invoices.push({
               invoiceId: parts[0],
               amount: parseFloat(parts[1]),
               cardNumber: null,
            });
         });
      }
   }

   return invoices;
}

/* ======================
   مقارنة الفواتير بالسجلات - مع مراعاة فلاتر العرض بدقة
   النتيجة: جدول منظم ثم زر لعرض "السند" لكل صف
   ====================== */
function compareInvoicesToRecords(invoices, records, options, branchAccountId) {
   const results = [];
   const usedInvoices = new Set();
   const usedRecords = new Set();

   // 1) مطابقات تامة (Card + Amount)
   if (options.showExact) {
      invoices.forEach((inv, i) => {
         const matchIdx = records.findIndex(
            (r, j) =>
               !usedRecords.has(j) &&
               r.cardNumber === inv.cardNumber &&
               Math.abs(r.amount - inv.amount) < 0.001
         );
         if (matchIdx !== -1) {
            results.push({
               type: "مطابقة تامة ✅",
               invoiceIndex: i,
               recordIndex: matchIdx,
               invoice: inv,
               record: records[matchIdx],
            });
            usedInvoices.add(i);
            usedRecords.add(matchIdx);
         }
      });
   }

   // 2) نفس رقم البطاقة لكن قيم مختلفة
   if (options.showCardOnly) {
      invoices.forEach((inv, i) => {
         if (usedInvoices.has(i)) return;
         const matchIdx = records.findIndex(
            (r, j) => !usedRecords.has(j) && r.cardNumber === inv.cardNumber
         );
         if (matchIdx !== -1) {
            results.push({
               type: "اختلاف في القيمة ⚠️",
               invoiceIndex: i,
               recordIndex: matchIdx,
               invoice: inv,
               record: records[matchIdx],
            });
            usedInvoices.add(i);
            usedRecords.add(matchIdx);
         }
      });
   }

   // 3) نفس القيمة لكن رقم البطاقة مختلف
   if (options.showAmountOnly) {
      invoices.forEach((inv, i) => {
         if (usedInvoices.has(i)) return;
         const matchIdx = records.findIndex(
            (r, j) =>
               !usedRecords.has(j) && Math.abs(r.amount - inv.amount) < 0.001
         );
         if (matchIdx !== -1) {
            results.push({
               type: "اختلاف في رقم البطاقة ⚠️",
               invoiceIndex: i,
               recordIndex: matchIdx,
               invoice: inv,
               record: records[matchIdx],
            });
            usedInvoices.add(i);
            usedRecords.add(matchIdx);
         }
      });
   }

   // 4) فواتير بدون أي تطابق (لم تُستهلك)
   if (options.showInvoiceOnly) {
      invoices.forEach((inv, i) => {
         if (usedInvoices.has(i)) return;
         results.push({
            type: "فاتورة غير موجودة ❌",
            invoiceIndex: i,
            recordIndex: null,
            invoice: inv,
            record: null,
         });
      });
   }

   // 5) سجلات بدون أي فاتورة
   if (options.showRecordOnly) {
      records.forEach((r, j) => {
         if (usedRecords.has(j)) return;
         results.push({
            type: "سجل غير مطابق ⚠️",
            invoiceIndex: null,
            recordIndex: j,
            invoice: null,
            record: r,
         });
      });
   }

   // ترتيب النتائج: مطابقة تامة أولًا ثم الباقي (اختياري)
   results.sort((a, b) => {
      const rank = {
         "مطابقة تامة ✅": 0,
         "اختلاف في القيمة ⚠️": 1,
         "اختلاف في رقم البطاقة ⚠️": 2,
         "فاتورة غير موجودة ❌": 3,
         "سجل غير مطابق ⚠️": 4,
      };
      return (rank[a.type] || 9) - (rank[b.type] || 9);
   });

   return results;
}

/* ======================
   عرض نتائج المقارنة كجدول (الهيكل المطلوب)
   الأعمدة: النوع - رقم البطاقة - القيمة في التقرير - القيمة في الفواتير - اظهار السند
   ====================== */
function renderCompareResults(results, records, invoices, branchAccountId) {
   const container = document.getElementById("compare-results");
   container.innerHTML = "";

   if (!results.length) {
      container.innerHTML = "<p>لا توجد نتائج للمقارنة.</p>";
      return;
   }

   const table = document.createElement("table");
   table.className = "compare-table";
   const thead = document.createElement("thead");
   thead.innerHTML = `<tr>
    <th>النوع</th><th>رقم البطاقة</th><th>القيمة في التقرير</th><th>القيمة في الفواتير</th><th>اظهار السند</th>
  </tr>`;
   table.appendChild(thead);

   const tbody = document.createElement("tbody");

   results.forEach((res, idx) => {
      const rec = res.record;
      const inv = res.invoice;

      const card = rec ? rec.cardNumber : inv ? inv.cardNumber : "";
      const reportValue = rec ? rec.amount.toFixed(3) : "";
      const invoiceValue = inv ? inv.amount.toFixed(3) : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td>${res.type}</td>
      <td>${card || "-"}</td>
      <td>${reportValue || "-"}</td>
      <td>${invoiceValue || "-"}</td>
      <td></td>
    `;

      // عمود "اظهار السند" -> زر يفتح لوحة تحتوي جدول السند
      const tdVoucher = tr.querySelector("td:last-child");
      const voucherBtn = document.createElement("button");
      voucherBtn.className = "voucher-btn";
      voucherBtn.textContent = "عرض السند ⬇";
      tdVoucher.appendChild(voucherBtn);

      const panel = document.createElement("div");
      panel.className = "voucher-panel";

      // نحسب الفرق: (report - invoice)
      let diff = null;
      if (rec && inv) diff = parseFloat((rec.amount - inv.amount).toFixed(3));
      else if (rec && !inv) diff = parseFloat(rec.amount.toFixed(3));
      else if (!rec && inv) diff = -parseFloat(inv.amount.toFixed(3));

      // نص البيان: ثابت مع استبدال أرقام الفاتورة والبطاقة
      const invId = inv
         ? inv.invoiceId
         : res.invoiceIndex != null
         ? invoices[res.invoiceIndex]?.invoiceId
         : "";
      const cardNum = card || (inv ? inv.cardNumber : "");
      const acct = branchAccountId || "-";

      // بناء جدول السند داخل الـ panel
      // صف 1: diff ، 0 ، account id ، بيان
      // صف 2: 0 ، diff ، account id ، بيان ثانِ (زيادة مبيعات عمان)
      const panelTable = document.createElement("table");
      panelTable.style.width = "100%";
      panelTable.innerHTML = `
      <tr>
        <th>قيمة الفرق</th><th>ثابت</th><th>Account ID</th><th>البيان</th>
      </tr>
      <tr>
        <td>${diff != null ? diff : "-"}</td>
        <td>0</td>
        <td>${acct}</td>
        <td>زيادة سحب بالفيزا بالكشف رقم البطاقة ${
           cardNum || "-"
        } رقم الفاتورة ${invId || "-"}</td>
      </tr>
      <tr>
        <td>0</td>
        <td>${diff != null ? diff : "-"}</td>
        <td>زيادة مبيعات عمان</td>
        <td>زيادة سحب بالفيزا بالكشف رقم البطاقة ${
           cardNum || "-"
        } رقم الفاتورة ${invId || "-"}</td>
      </tr>
    `;
      panel.appendChild(panelTable);

      // سلوك الزر
      voucherBtn.addEventListener("click", () => {
         const open = panel.classList.toggle("open");
         voucherBtn.textContent = open ? "إخفاء السند ⬆" : "عرض السند ⬇";
      });

      tdVoucher.appendChild(panel);
      tbody.appendChild(tr);
   });

   table.appendChild(tbody);
   container.appendChild(table);
}

/* ======================
   زر المقارنة (التكامل)
   ====================== */
document.getElementById("compare-btn").addEventListener("click", () => {
   const selectedId = document.getElementById("terminal-select").value;
   const invoiceText = document.getElementById("invoice-input").value;
   const invoices = parseInvoices(invoiceText);

   const terminal = merged.find((t) => t.terminalId === selectedId);
   if (!terminal) {
      alert("الرجاء اختيار Terminal صحيح");
      return;
   }

   const options = {
      showExact: document.getElementById("showExact").checked,
      showCardOnly: document.getElementById("showCardOnly").checked,
      showAmountOnly: document.getElementById("showAmountOnly").checked,
      showInvoiceOnly: document.getElementById("showInvoiceOnly").checked,
      showRecordOnly: document.getElementById("showRecordOnly").checked,
   };

   // ابحث عن حساب الفرع لاستخدامه في السندات
   const branch = branchInfo.find(
      (b) => String(b["Terminal ID"]).slice(-4) === String(selectedId).slice(-4)
   );
   const branchAccountId = branch ? branch["account id"] : "-";

   const results = compareInvoicesToRecords(
      invoices,
      terminal.transactions,
      options,
      branchAccountId
   );
   renderCompareResults(
      results,
      terminal.transactions,
      invoices,
      branchAccountId
   );
});
