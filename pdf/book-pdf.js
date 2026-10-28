/* Clean book PDF. pdfmake 0.2.20 and Roboto Condensed are bundled for offline use. */
(function (root) {
  "use strict";
  const mm = n => n * 72 / 25.4;
  // pdfmake multiplies font metrics, whereas CSS multiplies the font size.
  // Roboto Condensed hhea is 2400/2048 em: normalize to exactly 13 * 1.2 pt.
  const lineHeight = 1.2 * 2048 / 2400;
  const assets = ["pdfmake.min.js", "RobotoCondensed-Regular.ttf", "RobotoCondensed-Bold.ttf",
    "RobotoCondensed-Italic.ttf", "RobotoCondensed-BoldItalic.ttf"];
  const fonts = { Book: { normal: assets[1], bold: assets[2], italics: assets[3], bolditalics: assets[4] } };
  let enginePromise;

  // Read text nodes rather than strip HTML with a regexp. Marks and comment anchors
  // contribute their text, never their colours, badges, or comment bodies.
  function inline(html) {
    const template = document.createElement("template");
    template.innerHTML = html || "";
    const runs = [];
    function walk(node, style) {
      if (node.nodeType === 3) {
        const text = node.textContent.replace(/\u00ad/g, "");
        if (text) runs.push({ text, ...style });
        return;
      }
      if (node.nodeType !== 1 && node.nodeType !== 11) return;
      const tag = node.nodeName;
      if (["SCRIPT", "STYLE", "S", "STRIKE", "DEL"].includes(tag)) return;
      if (tag === "BR") { runs.push({ text: "\n", ...style }); return; }
      const next = { ...style };
      if (tag === "B" || tag === "STRONG") next.bold = true;
      if (tag === "I" || tag === "EM") next.italics = true;
      for (const child of node.childNodes) walk(child, next);
    }
    walk(template.content, {});
    return runs;
  }

  function numberedTitle(source, counters) {
    const title = String(source || "Без названия").replace(/\u00ad/g, "").trim();
    const match = title.match(/^(#{1,6})\s+(.+)$/);
    if (!match) return { title, label: "", caption: title, level: 0 };
    const level = match[1].length;
    counters.length = level;
    for (let i = 0; i < level - 1; i++) if (!counters[i]) counters[i] = 1;
    counters[level - 1] = (counters[level - 1] || 0) + 1;
    const label = (level === 1 ? "Глава " : "Раздел ") + counters.join(".");
    return { title: match[2], label, caption: label + ". " + match[2], level };
  }

  async function prepare(doc, images) {
    const book = (doc.parts || []).find(p => p.id === "book");
    const sections = [], counters = [];
    for (const section of book?.sections || []) {
      const blocks = [];
      for (const b of section.blocks || []) {
        if (b.t === "p") {
          const text = inline(b.html);
          if (text.some(run => run.text.trim())) blocks.push({ text });
        } else if (b.t === "img") {
          const src = images[b.img];
          if (!src) throw new Error("Нет иллюстрации «" + (b.cap || b.img) + "». Импортируй свежий файл книги.");
          // PDF supports JPEG/PNG; normalize other browser image formats locally.
          let data = src;
          if (!/^data:image\/(png|jpe?g);base64,/i.test(data)) {
            const image = new Image(); image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            canvas.getContext("2d").drawImage(image, 0, 0);
            data = canvas.toDataURL("image/png");
          }
          blocks.push({ image: data, caption: b.cap || "" });
        }
      }
      if (blocks.length) sections.push({ ...numberedTitle(section.title, counters), blocks });
    }
    if (!sections.length) throw new Error("В книге пока нет текста или иллюстраций для PDF.");
    return { title: doc.title || book?.head?.title || "Книга", sections };
  }

  function definition(book, chapterPages, recordPages) {
    const left = mm(20), right = mm(10), top = mm(10), bottom = mm(10);
    const width = 595.28 - left - right;
    const headings = new Map();
    const content = [
      { text: book.title, fontSize: 32, alignment: "center", margin: [0, mm(65), 0, mm(9)] },
      { canvas: [{ type: "line", x1: width / 2 - mm(7.5), x2: width / 2 + mm(7.5), y1: 0, y2: 0, lineWidth: 0.6, lineColor: "#999999" }] }
    ];
    book.sections.forEach((section, index) => {
      const id = "pdf-heading-" + index;
      headings.set(id, section.caption);
      const text = section.label
        ? [{ text: section.label + "\n", fontSize: 10, color: "#555555" }, { text: section.title, fontSize: 18 }]
        : section.title;
      content.push({ ...(section.level > 1 ? {} : { pageBreak: "before" }), stack: [
        { id, text, fontSize: 18, lineHeight, alignment: "center",
          margin: [0, section.level > 1 ? mm(5) : 0, 0, mm(6)] }
      ] });
      for (const block of section.blocks) {
        if (block.image) {
          content.push({ image: block.image, fit: [width, mm(210)], alignment: "center", margin: [0, mm(3), 0, mm(2)] });
          if (block.caption) content.push({ text: block.caption, fontSize: 10, alignment: "center", margin: [0, 0, 0, mm(3)] });
        } else content.push({ text: block.text.map(run => ({ ...run })), leadingIndent: mm(6), alignment: "justify", margin: 0 });
      }
    });
    return {
      info: { title: book.title, creator: "Книга Тишины" },
      pageSize: "A4", pageMargins: [left, top + 9 * 1.2 + mm(8), right, bottom + 12 + mm(4)],
      defaultStyle: { font: "Book", fontSize: 13, lineHeight, color: "#191919" },
      content,
      pageBreakBefore(node, following) {
        if (recordPages && headings.has(node.id)) chapterPages.set(node.id, { page: node.startPosition.pageNumber, caption: headings.get(node.id) });
        // Keep a heading with at least one line of its text.
        return headings.has(node.id) && following.length === 0;
      },
      header(page) {
        if (page === 1) return null;
        let caption = "";
        for (const section of chapterPages.values()) if (section.page <= page) caption = section.caption;
        return { margin: [left, top, right, 0], stack: [
          { columns: [{ text: book.title, width: "auto" }, { text: caption, alignment: "right", width: "*" }],
            columnGap: mm(8), fontSize: 9, lineHeight, color: "#666666" },
          { canvas: [{ type: "line", x1: 0, y1: mm(2), x2: width, y2: mm(2), lineWidth: 0.5, lineColor: "#dddddd" }] }
        ] };
      },
      footer(page) {
        return page === 1 ? null : { text: String(page - 1), fontSize: 10, alignment: "center", color: "#555555",
          margin: [left, mm(4), right, 0] };
      }
    };
  }

  async function loadEngine() {
    if (!enginePromise) enginePromise = (async () => {
      const base = new URL("pdf/", location.href);
      await new Promise((resolve, reject) => {
        if (root.pdfMake) return resolve();
        const script = document.createElement("script"); script.src = new URL(assets[0], base).href;
        script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error("Не удалось загрузить средство PDF. Обнови приложение и повтори.")); };
        document.head.append(script);
      });
      const files = {};
      await Promise.all(assets.slice(1).map(async name => {
        const response = await fetch(new URL(name, base));
        if (!response.ok) throw new Error("Не удалось загрузить шрифт PDF. Обнови приложение и повтори.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
        files[name] = btoa(binary);
      }));
      return { engine: root.pdfMake, files };
    })().catch(error => { enginePromise = null; throw error; });
    return enginePromise;
  }

  function render(engine, files, docDefinition, collect) {
    return new Promise((resolve, reject) => {
      try {
        // Fonts are already in VFS: synchronous layout errors remain catchable.
        const stream = engine.createPdf(docDefinition, null, fonts, files).getStream();
        const chunks = [];
        stream.on("data", chunk => { if (collect) chunks.push(chunk); });
        stream.on("error", reject);
        stream.on("end", () => resolve(collect ? new Blob(chunks, { type: "application/pdf" }) : null));
        stream.end();
      } catch (error) { reject(error); }
    });
  }

  async function create(doc, images) {
    const book = await prepare(doc, images), { engine, files } = await loadEngine();
    const pages = new Map();
    // First pass records actual chapter starts; second pass places the correct
    // running chapter title on every page, including long chapter continuations.
    await render(engine, files, definition(book, pages, true), false);
    return render(engine, files, definition(book, pages, false), true);
  }
  root.KnigaPDF = { create, prepare, numberedTitle, definition };
})(typeof window === "undefined" ? globalThis : window);
