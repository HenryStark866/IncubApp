-- Seed de prospectos pollito de un día (mismas filas que el botón de la app).
-- Requiere: supabase_migration_sales_clients.sql ya ejecutado.
-- Inserta en TODAS las organizaciones (o filtra por slug abajo).

INSERT INTO public.customers (
  org_id, code, name, city, department, farm_type, capacity_birds,
  status, product_interest, buys_day_old_chicks, notes, created_at, updated_at
)
SELECT
  o.id,
  v.code,
  v.name,
  v.city,
  v.department,
  v.farm_type,
  v.capacity_birds,
  v.status,
  'day_old_chicks',
  true,
  v.notes || E'\n\n[Seed demo · Fenavi 2025 · ranking aviNews/LaNota · listados regionales]',
  now(),
  now()
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('CO-DEMO-01', 'Granja María Pollo', 'Tuluá', 'Valle del Cauca', 'Engorde', 25000, 'prospect',
     'Productor regional Valle. Potencial pollito de un día para engorde.'),
    ('CO-DEMO-02', 'Granja Monterey Pollo', 'Palmira', 'Valle del Cauca', 'Engorde', 30000, 'prospect',
     'Palmira / Caluce. Candidato a lotes de pollito engorde 1 día.'),
    ('CO-DEMO-03', 'Avícola Los Cámbulos', 'Bucaramanga', 'Santander', 'Engorde / integración', 80000, 'active',
     'Ranking líderes avícolas (aviNews/LaNota). Escala para reposición de pollito.'),
    ('CO-DEMO-04', 'Don Pollo', 'Medellín', 'Antioquia', 'Engorde', 50000, 'prospect',
     'Empresa del ranking sectorial. Oferta pollito 1 día para engorde.'),
    ('CO-DEMO-05', 'Pollo Fiesta', 'Bogotá', 'Cundinamarca', 'Engorde', 40000, 'prospect',
     'Listada en ranking nacional. Prospecto reposición pollito.'),
    ('CO-DEMO-06', 'Pollos Savicol', 'Cali', 'Valle del Cauca', 'Engorde', 35000, 'active',
     'Suroccidente: fuerte engorde. Demanda de pollito de un día.'),
    ('CO-DEMO-07', 'Pollo Andino', 'Bogotá', 'Cundinamarca', 'Engorde', 45000, 'prospect',
     'Centro del país. Lotes de pollito 1 día para engorde.'),
    ('CO-DEMO-08', 'Nutriavícola', 'Barranquilla', 'Atlántico', 'Engorde', 60000, 'prospect',
     'Costa Caribe. Contexto 2025: consumo pollo 37,8 kg/hab (Fenavi).'),
    ('CO-DEMO-09', 'Pollos Eldorado', 'Bucaramanga', 'Santander', 'Engorde', 28000, 'prospect',
     'Hub Santander. Prospecto regional pollito 1 día.'),
    ('CO-DEMO-10', 'Avinal', 'Medellín', 'Antioquia', 'Engorde', 32000, 'active',
     'Antioquia: cluster engorde. Comprador potencial pollito.'),
    ('CO-DEMO-11', 'Avimol', 'Ibagué', 'Tolima', 'Engorde', 22000, 'prospect',
     'Tolima. Corredor productivo centro-sur.'),
    ('CO-DEMO-12', 'Avícola El Guamito', 'Pereira', 'Risaralda', 'Engorde', 18000, 'prospect',
     'Eje cafetero. Galpones medianos pollito 1 día.'),
    ('CO-DEMO-13', 'Pollo Olympico', 'Cúcuta', 'Norte de Santander', 'Engorde', 20000, 'prospect',
     'Oriente. Reposición pollito engorde comercial.'),
    ('CO-DEMO-14', 'Fabipollo', 'Villavicencio', 'Meta', 'Engorde', 15000, 'prospect',
     'Llanos: crecimiento engorde. Pollito de un día.'),
    ('CO-DEMO-15', 'Santipollo', 'Neiva', 'Huila', 'Engorde', 16000, 'prospect',
     'Huila. Lotes recurrentes de pollito 1 día.'),
    ('CO-DEMO-16', 'Avícola La Aurora', 'Manizales', 'Caldas', 'Engorde', 12000, 'prospect',
     'Eje cafetero. Granjas medianas compradoras de pollito.'),
    ('CO-DEMO-17', 'Avícola Torcoroma', 'Ocaña', 'Norte de Santander', 'Engorde', 14000, 'prospect',
     'Listados sectoriales. Engorde regional.'),
    ('CO-DEMO-18', 'Coavihuila', 'Pitalito', 'Huila', 'Engorde / cooperativa', 10000, 'prospect',
     'Productor/asociación Huila. Pedidos recurrentes pollito 1 día.'),
    ('CO-DEMO-19', 'Granja El Porvenir (avícola)', 'Fusagasugá', 'Cundinamarca', 'Engorde', 9000, 'prospect',
     'Cundinamarca concentra engorde (ICA/Fenavi).'),
    ('CO-DEMO-20', 'Sociedad Avícola Toscana', 'Rionegro', 'Antioquia', 'Engorde', 24000, 'active',
     'Oriente antioqueño: corredor de granjas de engorde.'),
    ('CO-DEMO-21', 'Pollos Tropical', 'Montería', 'Córdoba', 'Engorde', 20000, 'prospect',
     'Costa. Expansión engorde y pollito de un día.'),
    ('CO-DEMO-22', 'Avícola del Darién', 'Apartadó', 'Antioquia', 'Engorde', 11000, 'prospect',
     'Urabá. Logística de pollito 1 día a zona agropecuaria.'),
    ('CO-DEMO-23', 'Super Pollos del Galpón (Distraves)', 'Barranquilla', 'Atlántico', 'Engorde / marca', 70000, 'active',
     'Ranking líderes (Distraves). Cuenta grande / alianzas.'),
    ('CO-DEMO-24', 'Operadora Avícola Colombia (Grupo Bios)', 'Medellín', 'Antioquia', 'Integración / engorde', 120000, 'prospect',
     'Grupo Bios en líderes del sector. Volumen B2B pollito 1 día.')
) AS v(code, name, city, department, farm_type, capacity_birds, status, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.customers c
  WHERE c.org_id = o.id AND c.code = v.code
);

SELECT org_id, count(*) AS prospectos_demo
FROM public.customers
WHERE code LIKE 'CO-DEMO-%'
GROUP BY org_id;
