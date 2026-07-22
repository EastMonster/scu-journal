const PAGE_SIZE = 20;
let scuJournals = [];
let ccfEntries = [];
let journals = [];
let filtered = [];
let page = 1;
let mode = "scu";

const $ = (selector) => document.querySelector(selector);
const queryInput = $("#query");
const categorySelect = $("#category");
const typeSelect = $("#type-filter");
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

function getPageItems(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 3) return [1, 2, 3, 4, "right", total];
  if (current >= total - 2) return [1, "left", total - 3, total - 2, total - 1, total];
  return [1, "left", current - 1, current, current + 1, "right", total];
}

function queryTerms(query) {
  return [...new Set(query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean))];
}

function matchesQuery(journal, terms) {
  const searchable = [journal.fullname, journal.abbr, journal.issn].join(" ").toLocaleLowerCase();
  return terms.every((term) => searchable.includes(term));
}

function appendHighlighted(parent, text, terms) {
  if (!terms.length) { parent.append(text); return; }
  const escaped = [...terms].sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  text.split(pattern).forEach((part) => {
    if (!terms.includes(part.toLocaleLowerCase())) { parent.append(part); return; }
    const mark = document.createElement("mark");
    mark.textContent = part;
    parent.append(mark);
  });
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

function renderTable(rows, terms) {
  const isCcf = mode === "ccf";
  const showScuRank = isCcf && typeSelect.value !== "会议";
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  (isCcf ? ["名称", "类型", "大类", "CCF", ...(showScuRank ? ["川大"] : [])] : ["期刊", "学科分类", "川大", ...(ccfToggle.checked ? ["CCF"] : []), "中科院分区", "Top 期刊"]).forEach((text) => {
    const th = document.createElement("th"); th.textContent = text; header.append(th);
  });
  thead.append(header);
  const tbody = document.createElement("tbody");
  rows.forEach((journal) => {
    const tr = document.createElement("tr");
    const journalCell = document.createElement("td");
    journalCell.className = "journal-cell";
    const name = document.createElement("strong");
    appendHighlighted(name, journal.fullname, terms);
    const details = document.createElement("span");
    if (journal.abbr) appendHighlighted(details, journal.abbr, terms);
    if (journal.abbr && journal.issn) details.append(" · ");
    if (journal.issn) appendHighlighted(details, journal.issn, terms);
    journalCell.append(name, details);
    tr.append(journalCell);
    if (isCcf) {
      tr.append(cell("类型", journal.type));
      tr.append(cell("大类", journal.category));
      tr.append(cell("CCF", grade(journal.rank, "gold")));
      if (showScuRank) tr.append(cell("川大", grade(journal.scuRank, "red")));
    } else {
      tr.append(cell("学科分类", journal.category === "/" ? "未分类" : journal.category));
      tr.append(cell("川大", grade(journal.rank, "red")));
      if (ccfToggle.checked) tr.append(cell("CCF", grade(journal["ccf-rank"], "gold")));
      tr.append(cell("中科院分区", grade(journal["分区"] ? `${journal["分区"]} 区` : "")));
      const top = document.createElement("span");
      top.className = journal["Top 期刊"] === "是" ? "top" : "muted";
      top.textContent = journal["Top 期刊"] === "是" ? "TOP" : "—";
      tr.append(cell("Top 期刊", top));
    }
    tbody.append(tr);
  });
  table.append(thead, tbody); wrap.append(table);
  return wrap;
}

function render() {
  const terms = queryTerms(queryInput.value);
  const category = categorySelect.value;
  const type = mode === "ccf" ? typeSelect.value : "";
  filtered = journals.filter((journal) =>
    (!category || journal.category === category) &&
    (!type || journal.type === type) &&
    matchesQuery(journal, terms)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.min(page, totalPages);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  $("#result-count").textContent = filtered.length.toLocaleString("zh-CN");
  const content = $("#content");
  content.replaceChildren();
  content.className = visible.length ? "" : "message";
  if (visible.length) content.append(renderTable(visible, terms));
  else content.textContent = mode === "ccf" ? "没有找到匹配的期刊或会议，请尝试其他关键词或筛选条件。" : "没有找到匹配的期刊，请尝试其他关键词或分类。";

  const pagination = $("#pagination");
  pagination.hidden = filtered.length <= PAGE_SIZE;
  $("#previous").disabled = page === 1;
  $("#next").disabled = page === totalPages;
  const numbers = $("#page-numbers");
  numbers.replaceChildren();
  getPageItems(page, totalPages).forEach((item) => {
    if (typeof item === "string") {
      const ellipsis = document.createElement("span");
      ellipsis.className = "ellipsis";
      ellipsis.textContent = "…";
      ellipsis.setAttribute("aria-hidden", "true");
      numbers.append(ellipsis);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item;
    button.className = item === page ? "active" : "";
    button.setAttribute("aria-label", `第 ${item} 页`);
    if (item === page) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => { page = item; render(); });
    numbers.append(button);
  });
}

function resetAndRender() { page = 1; $("#clear").hidden = !queryInput.value; render(); }

function populateCategories() {
  categorySelect.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = mode === "ccf" ? "全部大类" : "全部学科";
  categorySelect.append(all);
  [...new Set(journals.map((journal) => journal.category))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category === "/" ? "未分类" : category;
      categorySelect.append(option);
    });
}

function setMode(nextMode) {
  mode = nextMode;
  journals = mode === "ccf" ? ccfEntries : scuJournals;
  queryInput.value = "";
  typeSelect.value = "";
  $("#clear").hidden = true;
  document.title = mode === "ccf" ? "CCF 期刊与会议查询" : "川大期刊分级查询";
  $("#page-title").textContent = mode === "ccf" ? "CCF 期刊与会议查询" : "川大期刊分级查询";
  $("#hero-description").textContent = mode === "ccf" ? "查询 CCF 推荐国际学术期刊与会议的大类、CCF 分级及川大分级。" : "汇集川大、CCF 与中科院分区信息，一次检索，快速对照。";
  queryInput.placeholder = mode === "ccf" ? "输入期刊或会议名称、简称" : "输入期刊名称、缩写或 ISSN";
  $("#search-label").textContent = mode === "ccf" ? "搜索期刊或会议" : "搜索期刊";
  $("#category-label").textContent = mode === "ccf" ? "筛选大类" : "筛选学科分类";
  $("#search-panel").setAttribute("aria-label", mode === "ccf" ? "CCF 期刊与会议筛选" : "期刊筛选");
  $("#result-unit").textContent = mode === "ccf" ? "条记录" : "条期刊";
  $("#ccf-toggle-field").hidden = mode === "ccf";
  $("#type-field").hidden = mode !== "ccf";
  document.querySelectorAll(".mode-switch button").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  populateCategories();
  $("#total-count").textContent = journals.length.toLocaleString("zh-CN");
  resetAndRender();
}

queryInput.addEventListener("input", resetAndRender);
$("#clear").addEventListener("click", () => { queryInput.value = ""; queryInput.focus(); resetAndRender(); });
categorySelect.addEventListener("change", () => { if (mode === "scu") ccfToggle.checked = categorySelect.value === "计算机科学"; resetAndRender(); });
typeSelect.addEventListener("change", resetAndRender);
ccfToggle.addEventListener("change", render);
document.querySelectorAll(".mode-switch button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("#previous").addEventListener("click", () => { page--; render(); });
$("#next").addEventListener("click", () => { page++; render(); });

const searchCheck = { fullname: "Science Translational Medicine", abbr: "SCI TRANSL MED", issn: "1946-6234" };
console.assert(parseCsv('a,b\n"x,y",z')[0].a === "x,y" && getPageItems(9, 460).join() === "1,left,8,9,10,right,460" && matchesQuery(searchCheck, queryTerms("trans m")) && !matchesQuery(searchCheck, queryTerms("trans x")));

Promise.all(["./rank.csv", "./ccf-directory.csv"].map((url) => fetch(url).then((response) => {
  if (!response.ok) throw new Error();
  return response.text();
})))
  .then(([scuText, ccfText]) => {
    scuJournals = parseCsv(scuText);
    ccfEntries = parseCsv(ccfText).map((entry) => ({
      fullname: entry["全称"],
      abbr: entry["简称"],
      issn: "",
      category: entry["大类"],
      type: entry["类型"],
      rank: entry["CCF分级"],
      scuRank: entry["川大分级"],
    }));
    setMode("scu");
  })
  .catch(() => {
    const content = $("#content");
    content.className = "message error";
    content.textContent = "无法加载目录数据。请通过静态服务器访问本目录，不要直接双击 HTML 文件。";
  });
