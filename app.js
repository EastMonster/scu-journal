const PAGE_SIZE = 20;
let journals = [];
let filtered = [];
let page = 1;

const $ = (selector) => document.querySelector(selector);
const queryInput = $("#query");
const categorySelect = $("#category");
const ccfToggle = $("#show-ccf");

function parseCsv(source) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => header.replace(/^\uFEFF/, ""));
  return dataRows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))
  );
}

function getPageNumbers(current, total) {
  const count = Math.min(3, total);
  const start = Math.max(1, Math.min(current - 1, total - count + 1));
  return Array.from({ length: count }, (_, index) => start + index);
}

function appendHighlighted(parent, text, query) {
  const needle = query.trim();
  if (!needle) { parent.append(text); return; }
  const lower = text.toLocaleLowerCase();
  const target = needle.toLocaleLowerCase();
  let cursor = 0, match = lower.indexOf(target);
  while (match >= 0) {
    parent.append(text.slice(cursor, match));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(match, match + needle.length);
    parent.append(mark);
    cursor = match + needle.length;
    match = lower.indexOf(target, cursor);
  }
  parent.append(text.slice(cursor));
}

function grade(value, tone = "navy") {
  const span = document.createElement("span");
  span.className = value ? `grade grade-${tone}` : "muted";
  span.textContent = value || "—";
  return span;
}

function cell(label, child) {
  const td = document.createElement("td");
  td.dataset.label = label;
  td.append(child);
  return td;
}

function renderTable(rows) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  ["期刊", "学科分类", "川大", ...(ccfToggle.checked ? ["CCF"] : []), "中科院分区", "Top 期刊"].forEach((text) => {
    const th = document.createElement("th"); th.textContent = text; header.append(th);
  });
  thead.append(header);
  const tbody = document.createElement("tbody");
  rows.forEach((journal) => {
    const tr = document.createElement("tr");
    const journalCell = document.createElement("td");
    journalCell.className = "journal-cell";
    const name = document.createElement("strong");
    appendHighlighted(name, journal.fullname, queryInput.value);
    const details = document.createElement("span");
    appendHighlighted(details, journal.abbr, queryInput.value);
    details.append(" · ");
    appendHighlighted(details, journal.issn, queryInput.value);
    journalCell.append(name, details);
    tr.append(journalCell);
    tr.append(cell("学科分类", journal.category === "/" ? "未分类" : journal.category));
    tr.append(cell("川大", grade(journal.rank, "red")));
    if (ccfToggle.checked) tr.append(cell("CCF", grade(journal["ccf-rank"], "gold")));
    tr.append(cell("中科院分区", grade(journal["分区"] ? `${journal["分区"]} 区` : "")));
    const top = document.createElement("span");
    top.className = journal["Top 期刊"] === "是" ? "top" : "muted";
    top.textContent = journal["Top 期刊"] === "是" ? "TOP" : "—";
    tr.append(cell("Top 期刊", top));
    tbody.append(tr);
  });
  table.append(thead, tbody); wrap.append(table);
  return wrap;
}

function render() {
  const query = queryInput.value.trim().toLocaleLowerCase();
  const category = categorySelect.value;
  filtered = journals.filter((journal) =>
    (!category || journal.category === category) &&
    (!query || [journal.fullname, journal.abbr, journal.issn].some((value) => value.toLocaleLowerCase().includes(query)))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.min(page, totalPages);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  $("#result-count").textContent = filtered.length.toLocaleString("zh-CN");
  const content = $("#content");
  content.replaceChildren();
  content.className = visible.length ? "" : "message";
  if (visible.length) content.append(renderTable(visible));
  else content.textContent = "没有找到匹配的期刊，请尝试其他关键词或分类。";

  const pagination = $("#pagination");
  pagination.hidden = filtered.length <= PAGE_SIZE;
  $("#previous").disabled = page === 1;
  $("#next").disabled = page === totalPages;
  const numbers = $("#page-numbers");
  numbers.replaceChildren();
  getPageNumbers(page, totalPages).forEach((number) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = number;
    button.className = number === page ? "active" : "";
    if (number === page) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => { page = number; render(); });
    numbers.append(button);
  });
}

function resetAndRender() { page = 1; $("#clear").hidden = !queryInput.value; render(); }
queryInput.addEventListener("input", resetAndRender);
$("#clear").addEventListener("click", () => { queryInput.value = ""; queryInput.focus(); resetAndRender(); });
categorySelect.addEventListener("change", () => { ccfToggle.checked = categorySelect.value === "计算机科学"; resetAndRender(); });
ccfToggle.addEventListener("change", render);
$("#previous").addEventListener("click", () => { page--; render(); });
$("#next").addEventListener("click", () => { page++; render(); });

console.assert(parseCsv('a,b\n"x,y",z')[0].a === "x,y" && getPageNumbers(10, 10).join() === "8,9,10");

fetch("./rank.csv")
  .then((response) => { if (!response.ok) throw new Error(); return response.text(); })
  .then((text) => {
    journals = parseCsv(text);
    [...new Set(journals.map((journal) => journal.category))]
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
      .forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category === "/" ? "未分类" : category;
        categorySelect.append(option);
      });
    $("#total-count").textContent = journals.length.toLocaleString("zh-CN");
    render();
  })
  .catch(() => {
    const content = $("#content");
    content.className = "message error";
    content.textContent = "无法加载期刊数据。请通过静态服务器访问本目录，不要直接双击 HTML 文件。";
  });
