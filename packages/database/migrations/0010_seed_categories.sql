-- Dados de referência: categorias do catálogo.
INSERT INTO categories (slug, name_pt, name_en) VALUES
  ('negocios', 'Negócios', 'Business'),
  ('tecnologia', 'Tecnologia', 'Technology'),
  ('pessoas', 'Pessoas', 'People'),
  ('viagens', 'Viagens', 'Travel'),
  ('natureza', 'Natureza', 'Nature'),
  ('alimentacao', 'Alimentação', 'Food')
ON CONFLICT (slug) DO NOTHING;
