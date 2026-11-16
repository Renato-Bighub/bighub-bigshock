import type { AiJobDto, LogoBrief } from "@bigstock/contracts";
import { format, intlLocale, type Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * Manual da marca em PDF, gerado no navegador a partir do logo já gerado (sem custo de créditos).
 * Todo o conteúdo é derivado do briefing e da imagem: paleta extraída dos píxeis, versões
 * criadas a partir de uma máscara do logótipo, tipografia sugerida pelo estilo.
 */

type RGB = [number, number, number];
const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const hexToRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

function cmyk([r, g, b]: RGB) {
  const k = 1 - Math.max(r, g, b) / 255;
  if (k >= 1) return [0, 0, 0, 100];
  const c = (1 - r / 255 - k) / (1 - k), m = (1 - g / 255 - k) / (1 - k), y = (1 - b / 255 - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function toCanvas(img: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  return { c, ctx };
}

/** Recorta as margens brancas e devolve o logótipo ajustado + máscara de opacidade (distância ao branco). */
function analyse(img: HTMLImageElement) {
  const { c, ctx } = toCanvas(img, img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  const { width: W, height: H } = c;
  const data = ctx.getImageData(0, 0, W, H);
  const d = data.data;
  const alpha = (i: number) => Math.max(255 - d[i]!, 255 - d[i + 1]!, 255 - d[i + 2]!);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (alpha((y * W + x) * 4) > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;

  const make = (fn: (r: number, g: number, b: number, a: number) => [number, number, number, number]) => {
    const { c: oc, ctx: octx } = toCanvas(img, w, h);
    const out = octx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y + y0) * W + (x + x0)) * 4, o = (y * w + x) * 4;
      const a = alpha(i);
      const [r, g, b, aa] = fn(d[i]!, d[i + 1]!, d[i + 2]!, a);
      out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = aa;
    }
    octx.putImageData(out, 0, 0);
    return oc.toDataURL("image/png");
  };
  const color = make((r, g, b, a) => [r, g, b, a < 8 ? 0 : 255]); // logótipo recortado, fundo branco removido
  const black = make((_r, _g, _b, a) => [0, 0, 0, a]);
  const white = make((_r, _g, _b, a) => [255, 255, 255, a]);

  // Paleta: quantização 4 bits/canal, ignora branco/transparente, agrupa cores próximas.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = ((y + y0) * W + (x + x0)) * 4;
    if (alpha(i) < 60) continue;
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((e) => [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)] as RGB);
  const palette: RGB[] = [];
  for (const col of ranked) {
    if (palette.every((p) => Math.hypot(p[0] - col[0], p[1] - col[1], p[2] - col[2]) > 60)) palette.push(col);
    if (palette.length === 4) break;
  }
  return { color, black, white, aspect: w / h, palette };
}

const TYPE: Record<LogoBrief["style"], { heading: string; body: string; mood: string; pdf: "helvetica" | "times" }> = {
  minimalista: { heading: "Inter", body: "Inter", mood: "neutra, limpa e funcional", pdf: "helvetica" },
  moderno: { heading: "Poppins", body: "Inter", mood: "geométrica e contemporânea", pdf: "helvetica" },
  classico: { heading: "Playfair Display", body: "Lora", mood: "elegante e com tradição", pdf: "times" },
  geometrico: { heading: "Montserrat", body: "Work Sans", mood: "precisa e sistemática", pdf: "helvetica" },
  manuscrito: { heading: "Pacifico", body: "Nunito", mood: "calorosa e próxima", pdf: "helvetica" },
  mascote: { heading: "Fredoka", body: "Nunito", mood: "simpática e expressiva", pdf: "helvetica" },
  emblema: { heading: "Cinzel", body: "Source Serif 4", mood: "sólida e institucional", pdf: "times" },
};
const STYLE_LABEL: Record<LogoBrief["style"], string> = { minimalista: "Minimalista", moderno: "Moderno", classico: "Clássico", geometrico: "Geométrico", manuscrito: "Manuscrito", mascote: "Mascote", emblema: "Emblema" };
const TYPE_LABEL: Record<LogoBrief["type"], string> = { simbolo_e_nome: "Símbolo e nome", monograma: "Monograma", so_nome: "Apenas nome (wordmark)", so_simbolo: "Apenas símbolo" };

export function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "marca";
}

export async function generateBrandManual(job: AiJobDto, imageUrl: string, locale: Locale = "pt"): Promise<void> {
  const dict = messagesFor(locale);
  const tr = (text: string, vars?: Record<string, string | number>) => format(dict[text] ?? text, vars);
  const intl = intlLocale(locale);
  const brief = job.brief;
  if (!brief) throw new Error("not_a_logo");
  const { jsPDF } = await import("jspdf");
  const img = await loadImage(imageUrl);
  const a = analyse(img);

  const palette = (brief.colors.length ? brief.colors.map(hexToRgb) : a.palette).slice(0, 4);
  if (palette.length === 0) palette.push([17, 22, 29]);
  const primary = palette[0]!;
  const ink: RGB = [17, 22, 29];
  const t = TYPE[brief.style];

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 20;
  let page = 0;

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const text = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const place = (src: string, cx: number, cy: number, maxW: number, maxH: number) => {
    const s = Math.min(maxW / a.aspect, maxH);
    const w = s * a.aspect;
    doc.addImage(src, "PNG", cx - w / 2, cy - s / 2, w, s);
    return { w, h: s };
  };
  const header = (n: string, title: string, intro: string) => {
    doc.addPage();
    page++;
    fill(primary); doc.rect(M, 22, 10, 1.6, "F");
    text(ink); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(`${n}`, M, 30);
    doc.setFontSize(24); doc.text(title, M, 42);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); text([90, 98, 110]);
    doc.text(doc.splitTextToSize(intro, W - 2 * M), M, 52);
    footer();
  };
  const footer = () => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); text([140, 146, 156]);
    doc.text(`${brief.brandName} · ${tr("Manual da marca")}`, M, H - 12);
    doc.text(String(page + 1), W - M, H - 12, { align: "right" });
  };

  // 1. Capa
  fill(primary); doc.rect(0, 0, W, H, "F");
  fill([255, 255, 255]); doc.roundedRect(M, 60, W - 2 * M, 120, 4, 4, "F");
  place(a.color, W / 2, 120, 110, 80);
  text([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(34); doc.text(tr("Manual da marca"), M, 215);
  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.text(brief.brandName, M, 226);
  doc.setFontSize(9); doc.text(new Date().toLocaleDateString(intl, { day: "2-digit", month: "long", year: "numeric" }), M, H - 16);

  // 2. Conceito
  header("01", tr("A marca"), tr("Resumo do briefing que originou o logótipo de {name}.", { name: brief.brandName }));
  const rows: [string, string][] = [[tr("Nome"), brief.brandName], [tr("Setor"), brief.sector], [tr("Tipo de logótipo"), tr(TYPE_LABEL[brief.type])], [tr("Estilo"), tr(STYLE_LABEL[brief.style])]];
  if (brief.tagline) rows.push([tr("Slogan"), brief.tagline]);
  let y = 75;
  for (const [k, v] of rows) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); text([140, 146, 156]); doc.text(k.toUpperCase(), M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(13); text(ink); doc.text(doc.splitTextToSize(v, W - 2 * M - 50), M + 50, y);
    doc.setDrawColor(230, 233, 238); doc.line(M, y + 4, W - M, y + 4);
    y += 14;
  }
  place(a.color, W / 2, y + 55, 120, 70);

  // 3. Área de proteção e tamanho mínimo
  header("02", tr("Logótipo"), tr("Mantenha sempre uma margem livre à volta do logótipo e respeite o tamanho mínimo para garantir legibilidade."));
  const lg = place(a.color, W / 2, 120, 100, 55);
  const x = Math.max(lg.h * 0.2, 6);
  doc.setDrawColor(primary[0], primary[1], primary[2]); doc.setLineDashPattern([1.5, 1.5], 0); doc.setLineWidth(0.3);
  doc.rect(W / 2 - lg.w / 2 - x, 120 - lg.h / 2 - x, lg.w + 2 * x, lg.h + 2 * x);
  doc.setLineDashPattern([], 0);
  text(primary); doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text(tr("X = 20% da altura do logótipo"), W / 2, 120 + lg.h / 2 + x + 6, { align: "center" });
  text(ink); doc.setFontSize(12); doc.text(tr("Tamanho mínimo"), M, 200);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); text([90, 98, 110]);
  doc.text(tr("Impresso: 20 mm de largura  ·  Ecrã: 96 px de largura"), M, 207);
  place(a.color, M + 10, 225, 20, 12); place(a.color, M + 50, 225, 34, 18);
  doc.setFontSize(8); doc.text("20 mm", M, 240); doc.text("34 mm", M + 40, 240);

  // 4. Versões
  header("03", tr("Versões"), tr("Use a versão a cores sempre que possível. As versões monocromática e negativa servem para fundos e meios limitados."));
  const cell = (cx: number, cy: number, bg: RGB, src: string, label: string, border = false) => {
    fill(bg); if (border) { doc.setDrawColor(225, 228, 234); doc.setLineWidth(0.3); doc.roundedRect(cx, cy, 80, 58, 2, 2, "FD"); } else doc.roundedRect(cx, cy, 80, 58, 2, 2, "F");
    place(src, cx + 40, cy + 29, 56, 34);
    text([90, 98, 110]); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(label, cx, cy + 66);
  };
  cell(M, 72, [255, 255, 255], a.color, tr("Principal, a cores"), true);
  cell(M + 90, 72, [255, 255, 255], a.black, tr("Monocromática (preto)"), true);
  cell(M, 150, ink, a.white, tr("Negativa, sobre fundo escuro"));
  cell(M + 90, 150, primary, a.white, tr("Negativa, sobre a cor da marca"));

  // 5. Cores
  header("04", tr("Cores"), tr("Paleta principal extraída do logótipo. Use os valores abaixo em todos os meios para manter a consistência."));
  palette.forEach((c, i) => {
    const cy = 72 + i * 42;
    fill(c); doc.roundedRect(M, cy, 40, 34, 2, 2, "F");
    if (c[0] > 235 && c[1] > 235 && c[2] > 235) { doc.setDrawColor(225, 228, 234); doc.roundedRect(M, cy, 40, 34, 2, 2, "S"); }
    text(ink); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(i === 0 ? tr("Cor principal") : tr("Cor de apoio {n}", { n: i }), M + 48, cy + 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); text([90, 98, 110]);
    const k = cmyk(c);
    doc.text(`HEX  ${hex(c)}`, M + 48, cy + 17);
    doc.text(`RGB  ${c.join(", ")}`, M + 48, cy + 23);
    doc.text(`CMYK  ${k.join(", ")} (${tr("aproximado")})`, M + 48, cy + 29);
  });
  doc.setFontSize(8); text([140, 146, 156]); doc.text(tr("Os valores CMYK são uma conversão aproximada: valide com a gráfica antes de produzir em grande escala."), M, H - 22);

  // 6. Tipografia
  header("05", tr("Tipografia"), tr("Sugestão de par tipográfico para uma voz {mood}. Ambas as famílias estão disponíveis gratuitamente no Google Fonts.", { mood: tr(t.mood) }));
  fill([245, 246, 249]); doc.roundedRect(M, 72, W - 2 * M, 58, 3, 3, "F");
  text(primary); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text(tr("TÍTULOS"), M + 8, 84);
  text(ink); doc.setFont(t.pdf, "bold"); doc.setFontSize(26); doc.text(t.heading, M + 8, 100);
  doc.setFont(t.pdf, "normal"); doc.setFontSize(11); doc.text("Aa Bb Cc Dd Ee Ff Gg 0123456789", M + 8, 112);
  fill([245, 246, 249]); doc.roundedRect(M, 138, W - 2 * M, 58, 3, 3, "F");
  text(primary); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text(tr("TEXTO CORRIDO"), M + 8, 150);
  text(ink); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text(t.body, M + 8, 164);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.text(doc.splitTextToSize(tr("A marca comunica-se com clareza, consistência e cuidado em cada ponto de contacto."), W - 2 * M - 16), M + 8, 176);

  // 7. Usos incorretos
  header("06", tr("Usos incorretos"), tr("Para proteger a identidade, evite qualquer alteração ao logótipo. Exemplos do que não fazer:"));
  const bad = (i: number, label: string, draw: (cx: number, cy: number) => void) => {
    const cx = M + (i % 2) * 90, cy = 72 + Math.floor(i / 2) * 66;
    fill([245, 246, 249]); doc.roundedRect(cx, cy, 80, 50, 2, 2, "F");
    draw(cx + 40, cy + 25);
    doc.setDrawColor(200, 30, 50); doc.setLineWidth(0.8); doc.line(cx + 73, cy + 4, cx + 77, cy + 8); doc.line(cx + 77, cy + 4, cx + 73, cy + 8);
    text([90, 98, 110]); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(label, cx, cy + 58);
  };
  bad(0, tr("Não distorcer nem esticar"), (cx, cy) => { doc.addImage(a.color, "PNG", cx - 30, cy - 8, 60, 16); });
  bad(1, tr("Não rodar"), (cx, cy) => { const s = 18; doc.addImage(a.color, "PNG", cx - (s * a.aspect) / 2, cy - s / 2, s * a.aspect, s, undefined, "NONE", 20); });
  bad(2, tr("Não aplicar sobre fundos com pouco contraste"), (cx, cy) => { fill(primary); doc.roundedRect(cx - 30, cy - 19, 60, 38, 2, 2, "F"); place(a.color, cx, cy, 36, 22); });
  bad(3, tr("Não acrescentar sombras ou efeitos"), (cx, cy) => { place(a.black, cx + 1.4, cy + 1.6, 44, 26); place(a.color, cx, cy, 44, 26); });

  // 8. Conformidade
  header("07", tr("Informação legal"), tr("Este logótipo foi gerado com inteligência artificial. Leia as notas abaixo antes de o usar comercialmente."));
  const notes = [
    [tr("Conteúdo gerado por IA"), tr("Logótipo gerado com o modelo {model} ({provider}) em {date}. Referência do pedido: {id}.", { model: job.model ?? "n/d", provider: job.provider ?? "n/d", date: new Date(job.created_at).toLocaleDateString(intl), id: job.id })],
    [tr("Verificação de originalidade"), tr("Antes de adotar a marca, pesquise bases de marcas (INPI, EUIPO) para confirmar que não há semelhança com marcas registadas. A geração por IA não garante exclusividade.")],
    [tr("Proteção por direitos de autor"), tr("Obras criadas sem intervenção criativa humana suficiente podem não ter proteção de direitos de autor. Para maior segurança, consulte um profissional e considere o registo da marca.")],
    [tr("Licença"), tr("A utilização está sujeita aos termos da plataforma Bighub Bigstock em vigor à data da geração.")],
  ];
  y = 74;
  for (const [k, v] of notes) {
    text(ink); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(k!, M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); text([90, 98, 110]);
    const lines = doc.splitTextToSize(v!, W - 2 * M);
    doc.text(lines, M, y + 6);
    y += 14 + lines.length * 4.6;
  }

  doc.save(`${slugify(tr("manual-da-marca"))}-${slugify(brief.brandName)}.pdf`);
}
