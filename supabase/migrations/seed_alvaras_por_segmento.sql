-- Seed: grupos e alvarás a partir de alvaras_exemplos/alvaras_por_segmento.xlsx
-- Frequência: anual. Reexecutável (ignora duplicados por nome).

-- Grupos
INSERT INTO public.alvara_groups (name, description, color)
SELECT v.name, v.description, v.color
FROM (VALUES
  ('Todos os tipos de empresa', 'Segmento importado (planilha exemplos).', '#64748b'),
  ('Alimentação & Bebidas', 'Segmento importado (planilha exemplos).', '#22c55e'),
  ('Saúde & Farmácias', 'Segmento importado (planilha exemplos).', '#ec4899'),
  ('Construção Civil & Imóveis', 'Segmento importado (planilha exemplos).', '#f97316'),
  ('Indústria & Manufatura', 'Segmento importado (planilha exemplos).', '#6366f1'),
  ('Educação & Cursos', 'Segmento importado (planilha exemplos).', '#0ea5e9'),
  ('Transporte & Logística', 'Segmento importado (planilha exemplos).', '#a855f7'),
  ('Financeiro & Contábil', 'Segmento importado (planilha exemplos).', '#eab308'),
  ('Comércio & Varejo', 'Segmento importado (planilha exemplos).', '#14b8a6'),
  ('Tecnologia & Software', 'Segmento importado (planilha exemplos).', '#ef4444'),
  ('Hotelaria & Turismo', 'Segmento importado (planilha exemplos).', '#8b5cf6'),
  ('Beleza & Estética', 'Segmento importado (planilha exemplos).', '#f43f5e')
) AS v(name, description, color)
WHERE NOT EXISTS (SELECT 1 FROM public.alvara_groups g WHERE g.name = v.name);

-- Alvarás (anual, weekend_adjust none)
INSERT INTO public.alvaras (group_id, name, description, orgao_emissor, frequencia, weekend_adjust)
SELECT g.id, v.nome, NULLIF(v.description, ''), NULLIF(v.orgao, ''), 'anual', 'none'
FROM (VALUES
  ('Todos os tipos de empresa', 'Alvará de Funcionamento (Licença de Localização)', 'Autoriza o funcionamento do estabelecimento no endereço indicado. Obrigatório para qualquer CNPJ com ponto físico.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Todos os tipos de empresa', 'Habite-se / Auto de Conclusão', 'Confirma que o imóvel está em conformidade com as normas construtivas.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Todos os tipos de empresa', 'Inscrição Municipal (ISS)', 'Cadastro para emissão de nota fiscal de serviços.

Esfera: Municipal', 'Secretaria de Fazenda Municipal'),
  ('Todos os tipos de empresa', 'Inscrição Estadual (ICMS)', 'Obrigatória para empresas que comercializam mercadorias.

Esfera: Estadual', 'SEFAZ Estadual'),
  ('Todos os tipos de empresa', 'Cadastro CNPJ (CNAE adequado)', 'Registro federal que define a atividade econômica principal e secundárias.

Esfera: Federal', 'Receita Federal'),
  ('Alimentação & Bebidas', 'Alvará Sanitário (Vigilância Sanitária)', 'Exigido para qualquer estabelecimento que manipule, produza ou comercialize alimentos e bebidas.

Esfera: Órgão Específico', 'VISA Municipal/Estadual'),
  ('Alimentação & Bebidas', 'Licença de Funcionamento para Alimentos', 'Específica para restaurantes, lanchonetes, padarias, açougues, bares.

Esfera: Municipal', 'Prefeitura / VISA'),
  ('Alimentação & Bebidas', 'SIF / SIE / SIM (Inspeção de Carnes e Derivados)', 'Inspeção federal (SIF), estadual (SIE) ou municipal (SIM) para abate e processamento de proteína animal.

Esfera: Órgão Específico', 'MAPA / Estadual / Municipal'),
  ('Alimentação & Bebidas', 'Registro de Estabelecimento no MAPA', 'Para produtores e distribuidores de bebidas, azeites, vinhos e alimentos processados.

Esfera: Federal', 'MAPA'),
  ('Alimentação & Bebidas', 'Licença de Obras / Projeto Arquitetônico aprovado', 'Adaptações do espaço físico para cozinha industrial e layout sanitário.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Alimentação & Bebidas', 'Alvará do Corpo de Bombeiros (AVCB/CLCB)', 'Auto de Vistoria ou Certificado de Licença do Corpo de Bombeiros.

Esfera: Estadual', 'Corpo de Bombeiros Estadual'),
  ('Saúde & Farmácias', 'Alvará Sanitário (ANVISA / VISA)', 'Obrigatório para clínicas, consultórios, laboratórios, hospitais e farmácias.

Esfera: Órgão Específico', 'ANVISA / VISA'),
  ('Saúde & Farmácias', 'Registro no CRM / CFO / CRF / COREN etc.', 'Registro do profissional e da empresa no conselho de classe correspondente.

Esfera: Órgão Específico', 'Conselho Profissional'),
  ('Saúde & Farmácias', 'Licença de Funcionamento de Farmácia', 'Emitida pela ANVISA e VISA estadual/municipal, exige responsável técnico farmacêutico.

Esfera: Órgão Específico', 'ANVISA / VISA'),
  ('Saúde & Farmácias', 'AFE – Autorização de Funcionamento de Empresa', 'Para farmácias, distribuidoras e indústrias farmacêuticas.

Esfera: Federal', 'ANVISA'),
  ('Saúde & Farmácias', 'Licença para Radiação Ionizante (raio-X, tomógrafo)', 'Exigida para clínicas e hospitais com equipamentos de imagem.

Esfera: Federal', 'ANVISA / CNEN'),
  ('Saúde & Farmácias', 'Alvará do Corpo de Bombeiros (AVCB)', 'Obrigatório para estabelecimentos de saúde.

Esfera: Estadual', 'Corpo de Bombeiros'),
  ('Saúde & Farmácias', 'Licença Ambiental (resíduos biológicos)', 'Para gestão de resíduos de serviços de saúde (RSS).

Esfera: Órgão Específico', 'IBAMA / OEMA'),
  ('Construção Civil & Imóveis', 'Alvará de Construção / Licença de Obras', 'Permissão para executar obra, reforma ou demolição.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Construção Civil & Imóveis', 'Registro no CREA / CAU', 'Empresa e responsável técnico devem estar registrados.

Esfera: Órgão Específico', 'CREA / CAU'),
  ('Construção Civil & Imóveis', 'ART / RRT', 'Anotação de Responsabilidade Técnica (engenharia) ou Registro de Responsabilidade Técnica (arquitetura).

Esfera: Órgão Específico', 'CREA / CAU'),
  ('Construção Civil & Imóveis', 'Licença Ambiental (obras de impacto)', 'Exigida em obras de grande porte, terrenos com vegetação nativa ou próximos a corpos d''água.

Esfera: Órgão Específico', 'IBAMA / OEMA'),
  ('Construção Civil & Imóveis', 'Habite-se / Auto de Conclusão', 'Emitido ao término da obra atestando conformidade.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Construção Civil & Imóveis', 'CRECI (Imobiliárias e corretores)', 'Registro obrigatório no Conselho Regional de Corretores de Imóveis.

Esfera: Órgão Específico', 'CRECI'),
  ('Indústria & Manufatura', 'Licença Ambiental de Instalação e Operação', 'Licença prévia, de instalação e de operação exigida para atividades poluidoras ou de impacto.

Esfera: Órgão Específico', 'IBAMA / OEMA'),
  ('Indústria & Manufatura', 'Alvará de Funcionamento (Localização)', 'Liberação do endereço industrial pela prefeitura.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Indústria & Manufatura', 'AVCB – Auto de Vistoria do Corpo de Bombeiros', 'Essencial para galpões industriais e armazéns.

Esfera: Estadual', 'Corpo de Bombeiros'),
  ('Indústria & Manufatura', 'Registro no MAPA ou INMETRO (conforme produto)', 'Obrigatório para indústrias de alimentos, bebidas, cosméticos e produtos regulados.

Esfera: Federal', 'MAPA / INMETRO / ANVISA'),
  ('Indústria & Manufatura', 'AFE – Autorização de Funcionamento (ANVISA)', 'Para fabricantes de medicamentos, cosméticos, saneantes e alimentos.

Esfera: Federal', 'ANVISA'),
  ('Indústria & Manufatura', 'Licença para Uso de Recursos Hídricos (outorga)', 'Para indústrias que captam ou lançam efluentes em corpos d''água.

Esfera: Órgão Específico', 'ANA / OEMA'),
  ('Indústria & Manufatura', 'Cadastro Técnico Federal (CTF/IBAMA)', 'Para atividades potencialmente poluidoras.

Esfera: Federal', 'IBAMA'),
  ('Educação & Cursos', 'Autorização de Funcionamento (MEC)', 'Para instituições de ensino superior e técnico federal.

Esfera: Federal', 'MEC'),
  ('Educação & Cursos', 'Autorização da Secretaria Estadual de Educação', 'Para escolas de educação básica (infantil, fundamental, médio).

Esfera: Estadual', 'Secretaria Estadual de Educação'),
  ('Educação & Cursos', 'Alvará Municipal de Funcionamento', 'Licença de localização para o prédio escolar.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Educação & Cursos', 'Alvará Sanitário', 'Para espaços com refeitório ou cozinha (creches, escolas).

Esfera: Órgão Específico', 'VISA'),
  ('Educação & Cursos', 'AVCB – Corpo de Bombeiros', 'Obrigatório para espaços com grande circulação de pessoas.

Esfera: Estadual', 'Corpo de Bombeiros'),
  ('Educação & Cursos', 'Alvará de Acessibilidade', 'Conformidade com normas NBR 9050 de acessibilidade.

Esfera: Municipal', 'Prefeitura / CREA'),
  ('Transporte & Logística', 'ANTT – Registro de Transportador', 'Para transportadores rodoviários de cargas (ETC, CTC, TAC).

Esfera: Federal', 'ANTT'),
  ('Transporte & Logística', 'Licença de Operação de Armazém (MAPA)', 'Para armazéns de produtos agrícolas.

Esfera: Federal', 'MAPA'),
  ('Transporte & Logística', 'Autorização da ANAC', 'Para transportadoras aéreas e empresas de serviços aeroportuários.

Esfera: Federal', 'ANAC'),
  ('Transporte & Logística', 'Permissão da ANTAQ', 'Para transporte aquaviário e operadores portuários.

Esfera: Federal', 'ANTAQ'),
  ('Transporte & Logística', 'Alvará Municipal de Funcionamento (garagens/depósitos)', 'Liberação do endereço do pátio ou armazém.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Transporte & Logística', 'Licença Ambiental (frota / combustível / resíduos)', 'Para garagens com tanques de combustível e manutenção de frota.

Esfera: Órgão Específico', 'IBAMA / OEMA'),
  ('Transporte & Logística', 'Alvará da Vigilância Sanitária (transporte de alimentos)', 'Para veículos e armazéns frigorificados.

Esfera: Órgão Específico', 'VISA'),
  ('Financeiro & Contábil', 'Autorização do BACEN', 'Para instituições financeiras, fintechs de pagamento e cooperativas de crédito.

Esfera: Federal', 'Banco Central do Brasil'),
  ('Financeiro & Contábil', 'Registro na CVM', 'Para gestoras de investimentos, corretoras e distribuidoras de valores.

Esfera: Federal', 'CVM'),
  ('Financeiro & Contábil', 'Registro na SUSEP', 'Para seguradoras, corretoras de seguros e entidades de previdência privada.

Esfera: Federal', 'SUSEP'),
  ('Financeiro & Contábil', 'Registro no CRC (Contabilidade)', 'Obrigatório para escritórios de contabilidade e seus responsáveis.

Esfera: Órgão Específico', 'CRC Estadual'),
  ('Financeiro & Contábil', 'Cadastro na COAF (PLD-FT)', 'Para prevenção à lavagem de dinheiro.

Esfera: Federal', 'COAF / BACEN / CVM'),
  ('Financeiro & Contábil', 'Alvará Municipal de Funcionamento', 'Para o estabelecimento físico.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Comércio & Varejo', 'Alvará de Funcionamento (Localização)', 'Obrigatório para qualquer ponto de venda físico.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Comércio & Varejo', 'Inscrição Estadual (ICMS)', 'Para emissão de NF-e de mercadorias.

Esfera: Estadual', 'SEFAZ Estadual'),
  ('Comércio & Varejo', 'Alvará Sanitário (alimentos/cosméticos)', 'Para lojas que comercializam produtos alimentícios, cosméticos ou farmacêuticos.

Esfera: Órgão Específico', 'VISA'),
  ('Comércio & Varejo', 'AVCB – Corpo de Bombeiros', 'Para lojas e centros comerciais.

Esfera: Estadual', 'Corpo de Bombeiros'),
  ('Comércio & Varejo', 'Registro de Importador/Exportador (Siscomex/Radar)', 'Para operações de comércio exterior.

Esfera: Federal', 'Receita Federal / SECEX'),
  ('Comércio & Varejo', 'Licença de Publicidade (outdoor / fachada)', 'Para instalação de letreiros, placas e publicidade externa.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Tecnologia & Software', 'Alvará de Funcionamento (escritório)', 'Liberação do endereço do escritório ou hub.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Tecnologia & Software', 'Inscrição Municipal (ISS)', 'Para emissão de NFS-e de serviços de TI.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Tecnologia & Software', 'Homologação ANATEL (hardware)', 'Para fabricantes ou importadores de equipamentos de telecomunicações.

Esfera: Federal', 'ANATEL'),
  ('Tecnologia & Software', 'Autorização para SVA (ANATEL)', 'Para provedores de Serviço de Valor Adicionado (internet, streaming).

Esfera: Federal', 'ANATEL'),
  ('Tecnologia & Software', 'Certificação LGPD / ISO 27001', 'Frequentemente exigida por clientes e licitações.

Esfera: Órgão Específico', 'ANPD / Certificadoras'),
  ('Hotelaria & Turismo', 'Alvará de Funcionamento Municipal', 'Licença de localização para o estabelecimento.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Hotelaria & Turismo', 'Cadastro no Cadastur (MTUR)', 'Obrigatório para meios de hospedagem, agências de turismo e guias.

Esfera: Federal', 'Ministério do Turismo'),
  ('Hotelaria & Turismo', 'Alvará Sanitário', 'Para instalações com cozinha, piscina e lavanderia.

Esfera: Órgão Específico', 'VISA'),
  ('Hotelaria & Turismo', 'AVCB – Corpo de Bombeiros', 'Essencial para hotéis e pousadas.

Esfera: Estadual', 'Corpo de Bombeiros'),
  ('Hotelaria & Turismo', 'Licença Ambiental (áreas de proteção)', 'Para empreendimentos em APAs, litoral ou mata.

Esfera: Órgão Específico', 'IBAMA / OEMA'),
  ('Hotelaria & Turismo', 'Outorga de Uso de Água', 'Para captação de água superficial ou subterrânea.

Esfera: Órgão Específico', 'ANA / OEMA'),
  ('Beleza & Estética', 'Alvará de Funcionamento Municipal', 'Para salões, barbearias, clínicas de estética.

Esfera: Municipal', 'Prefeitura Municipal'),
  ('Beleza & Estética', 'Alvará Sanitário', 'Exigido para ambientes que manipulam cabelos, realizam depilação, micropigmentação ou aplicam cosméticos.

Esfera: Órgão Específico', 'VISA'),
  ('Beleza & Estética', 'AVCB – Corpo de Bombeiros', 'Para espaços com grande circulação.

Esfera: Estadual', 'Corpo de Bombeiros'),
  ('Beleza & Estética', 'Registro no CRM / CFM (procedimentos médicos)', 'Para clínicas de estética que realizam procedimentos médicos (botox, preenchimento).

Esfera: Órgão Específico', 'CRM / CFM'),
  ('Beleza & Estética', 'Registro de Produto na ANVISA (cosméticos próprios)', 'Para estabelecimentos que produzem ou revendem cosméticos próprios.

Esfera: Federal', 'ANVISA')
) AS v(segmento, nome, description, orgao)
JOIN public.alvara_groups g ON g.name = v.segmento
WHERE NOT EXISTS (
  SELECT 1 FROM public.alvaras a WHERE a.group_id = g.id AND a.name = v.nome
);
