/** Metadados das imagens de demonstração da pasta local (ficheiros não versionados, sem direitos comerciais). */
export interface FolderImage { file: string; title: string; category: "natureza" | "negocios" | "viagens" | "pessoas" | "tecnologia" | "alimentacao"; tags: string[] }

export const FOLDER_IMAGES: FolderImage[] = [
  { file: "2148709302.jpg", title: "Máscara facial de beleza", category: "pessoas", tags: ["skincare", "beleza", "spa", "rosto"] },
  { file: "2148752467.jpg", title: "Cuidados de pele em casa", category: "pessoas", tags: ["skincare", "toalha", "bem-estar", "casa de banho"] },
  { file: "Eletrodomésticos.jpeg", title: "Kit de eletrodomésticos de cozinha", category: "tecnologia", tags: ["eletrodomésticos", "varinha mágica", "cozinha", "produto"] },
  { file: "a-woman-wearing-a-smartwatch-2021-08-27-00-04-35-utc.jpeg", title: "Smartwatch no pulso", category: "tecnologia", tags: ["smartwatch", "wearable", "relógio", "tecnologia"] },
  { file: "adorable-smiling-child-sitting-in-a-baby-chair-in-2021-09-01-03-31-45-utc.jpeg", title: "Criança sorridente na cadeira de bebé", category: "pessoas", tags: ["criança", "bebé", "família", "sorriso"] },
  { file: "athletic-active-background-adult-athlete.jpg", title: "Atleta em ambiente ativo", category: "pessoas", tags: ["atleta", "desporto", "fitness", "ativo"] },
  { file: "attractive-seductive-sensual-stylish-woman-boho-dress-sitting-vintage-retro-cafe-holding-perfume.jpg", title: "Mulher com perfume num café vintage", category: "pessoas", tags: ["perfume", "moda", "café", "vintage"] },
  { file: "cooking-accessories.jpeg", title: "Acessórios de cozinha", category: "alimentacao", tags: ["cozinha", "utensílios", "cozinhar", "produto"] },
  { file: "couple-choosing-vacuum-cleaner.jpeg", title: "Casal a escolher um aspirador", category: "pessoas", tags: ["casal", "aspirador", "compras", "eletrodomésticos"] },
  { file: "decoração.jpeg", title: "Sala de estar moderna", category: "negocios", tags: ["decoração", "sofá", "interiores", "casa"] },
  { file: "department-computers-electronics.jpeg", title: "Departamento de computadores e eletrónica", category: "tecnologia", tags: ["computadores", "eletrónica", "loja", "retalho"] },
  { file: "electronics-store.jpg", title: "Loja de eletrónica", category: "negocios", tags: ["loja", "eletrónica", "retalho", "comércio"] },
  { file: "hero.jpg", title: "Fotógrafo junto ao rio", category: "natureza", tags: ["fotografia", "rio", "ponte", "viagem"] },
  { file: "young-fitness-woman-runner-warming-up-before-running-rooftop.jpg", title: "Corredora a aquecer num terraço", category: "pessoas", tags: ["corrida", "fitness", "aquecimento", "desporto"] },
  { file: "young-happy-sportswoman-drinking-smoothie-while-relaxing-floor-surfing-net-laptop.jpg", title: "Desportista a beber um batido", category: "alimentacao", tags: ["batido", "smoothie", "saudável", "portátil"] },
  { file: "young-happy-sportswoman-using-blender-making-fruit-smoothie-kitchen.jpg", title: "Desportista a fazer um batido de fruta", category: "alimentacao", tags: ["liquidificador", "fruta", "smoothie", "cozinha"] },
  { file: "young-happy-sportswoman.jpg", title: "Desportista feliz", category: "pessoas", tags: ["desporto", "sorriso", "retrato", "fitness"] },
  { file: "young-man-sportswear-exercise-class-gym.jpg", title: "Aula de exercício no ginásio", category: "pessoas", tags: ["ginásio", "exercício", "treino", "fitness"] },
  { file: "young-men-with-shopping-bags-2021-08-30-00-17-15-utc.jpeg", title: "Jovens com sacos de compras", category: "negocios", tags: ["compras", "retalho", "moda", "amigos"] },
];
