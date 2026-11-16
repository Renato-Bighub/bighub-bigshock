// Catálogo e downloads ainda não existem no backend (Fase 2). Estes dados são
// apenas ilustrativos para compor o layout aprovado; serão substituídos pela API.
export const categories = [
  { title: "Negócios", slug: "negocios", img: "category-business.jpg" },
  { title: "Tecnologia", slug: "tecnologia", img: "category-technology.jpg" },
  { title: "Pessoas", slug: "pessoas", img: "category-people.jpg" },
  { title: "Viagens", slug: "viagens", img: "category-travel.jpg" },
  { title: "Natureza", slug: "natureza", img: "category-nature.jpg" },
  { title: "Alimentação", slug: "alimentacao", img: "category-food.jpg" },
];

export const newImages = [
  { title: "Vindima ao pôr do sol", img: "fresh-vineyard.jpg" },
  { title: "Arquitetura empresarial", img: "fresh-office.jpg" },
  { title: "Costa ao entardecer", img: "fresh-coast.jpg" },
  { title: "Profissional de restauração", img: "fresh-barista.jpg" },
  { title: "Energia renovável", img: "fresh-energy.jpg" },
  { title: "Elétrico na cidade", img: "fresh-city.jpg" },
];

export const heroChips = ["natureza", "negocios", "tecnologia", "pessoas", "viagens"].map((slug) => ({ slug, label: categories.find((c) => c.slug === slug)!.title }));
