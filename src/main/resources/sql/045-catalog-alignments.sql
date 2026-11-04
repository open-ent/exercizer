-- Rattachement des sujets du catalogue (042) aux programmes de l'école primaire (référentiel CASE
-- du module case), pour que le catalogue se range par programme sans installer le pack.
-- Fichier GÉNÉRÉ par deployment/catalog-seed/catalog_seed.py --alignments — ne pas modifier à la main.
-- Idempotent : le pack « Catalogue d'exercices » pose les mêmes rattachements.

-- Les couleurs et les formes : C1.OUM.3.4, C1.AAR.1.3.5
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('2c53ca47-e678-5611-84d2-77954015344d'), ('fb4c799f-390a-5a29-b8fb-ed6bf9f83f6b')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les couleurs et les formes'
ON CONFLICT DO NOTHING;

-- Les sons du début des mots : C1.LAN.2.1.18, C1.LAN.3.2.11, C2.FRA.1.1.1
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('34c52cbe-4ad1-5152-8ab6-c2f9f9611b76'), ('1983bec4-42f3-5abf-9dc4-e66b1745e2e7'), ('c9e19957-716e-5c99-a01a-b1a2955d9631')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les sons du début des mots'
ON CONFLICT DO NOTHING;

-- Additions jusqu'à 10 : C2.MAT.1.2.1, C2.MAT.1.3.1.1
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('92b3ce56-2e27-5735-98f6-81afdcffd2d0'), ('807f3efa-3176-5acf-af0a-fd9c216af2ba')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Additions jusqu''à 10'
ON CONFLICT DO NOTHING;

-- Lire des mots simples : C2.FRA.1.1.2, C2.FRA.1.1.5
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('19086bf9-35a1-5f5b-8919-c7ac1f05da0f'), ('b14c589d-6df3-5be7-8125-f4ca88343374')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Lire des mots simples'
ON CONFLICT DO NOTHING;

-- Le jour et la nuit, les saisons : C2.HGE.1.1.1, C2.HGE.1.2.1
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('90785827-a172-5cf6-ada6-87440c5a7b1f'), ('525aeea0-9a7c-59e7-be1c-57e774ba7c3d')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Le jour et la nuit, les saisons'
ON CONFLICT DO NOTHING;

-- Additions et soustractions jusqu'à 100 : C2.MAT.1.2.5
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('6613dcff-ad14-5cd0-afec-821e30e1a0c6')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Additions et soustractions jusqu''à 100'
ON CONFLICT DO NOTHING;

-- Le nom et le verbe : C2.FRA.5.1.4, C2.FRA.5.1.8
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('8dbeb413-33dd-5674-89c4-6f7b5856eb88'), ('8822bbeb-c61f-560e-aecf-9fda0f847b8d')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Le nom et le verbe'
ON CONFLICT DO NOTHING;

-- Les animaux et leur milieu : C2.QLM.1.10, C2.SCT.2.2.5
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('1fb2726e-f1ed-5f0f-9c4b-71275148ee65'), ('144361fc-aff8-52c7-a88f-7f3d2635c9b5')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les animaux et leur milieu'
ON CONFLICT DO NOTHING;

-- Les nombres en anglais : C2.LVE.1.2.4
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('9be3bac6-95de-5ae0-b89d-c815c440e705')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les nombres en anglais'
ON CONFLICT DO NOTHING;

-- Les tables de multiplication : C2.MAT.1.3.1.7
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('83e68db8-24ad-554e-824a-9898e30c39b5')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les tables de multiplication'
ON CONFLICT DO NOTHING;

-- Le présent de l'indicatif : C2.FRA.5.2.3, C3.FRA.5.2.20
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('28a92c94-86da-5b28-85f6-cef8bbe4c8b6'), ('e7931cb2-c6cd-5378-98e7-15f8a2bd051b')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Le présent de l''indicatif'
ON CONFLICT DO NOTHING;

-- Le cycle de l'eau : C2.QLM.1.8, C2.QLM.1.9
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('16d6cba1-d0cd-5c3c-aacf-29a8b1d2c0b3'), ('0b5e1182-214a-5671-8459-9fff7f931b52')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Le cycle de l''eau'
ON CONFLICT DO NOTHING;

-- Les fractions simples : C3.MAT.1.2.1
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('fc208202-e1da-5f4d-932f-a54f6b34b56b')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les fractions simples'
ON CONFLICT DO NOTHING;

-- Les accords dans le groupe nominal : C3.FRA.5.2.4, C3.FRA.5.2.9
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('1452f2a6-4aa9-53a4-9c44-8c2bcc2e024b'), ('645dbcf1-e91d-5de7-9f19-db2e0e73cd74')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les accords dans le groupe nominal'
ON CONFLICT DO NOTHING;

-- Daily routine : C3.LVE.2.2.3
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('2779bfad-087c-51e1-88c8-89f3f5637036')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Daily routine'
ON CONFLICT DO NOTHING;

-- Les nombres décimaux : C3.MAT.1.3.21, C3.MAT.1.3.24
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('ecd8e2f1-f5cc-5ef5-a7b8-184f649b777f'), ('aa5f450c-0e5a-5078-a2e0-bb6a6ecdcbf4')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les nombres décimaux'
ON CONFLICT DO NOTHING;

-- Les grands repères de la géographie de la France : C3.HGE.3.1.2, C3.HGE.3.1.3
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('479e1698-e468-5d17-8592-2516aadd3e12'), ('b2c776da-d300-52aa-ad93-5e8e40b999a3')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Les grands repères de la géographie de la France'
ON CONFLICT DO NOTHING;

-- L'énergie et ses sources : C3.SCT.5.11
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('2e46d4e1-70ed-57a0-a44c-9c8f606ae7e3')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'L''énergie et ses sources'
ON CONFLICT DO NOTHING;

-- Citoyenneté et institutions : C3.EMC.2.1.2, C3.EMC.2.1.3
INSERT INTO exercizer.subject_alignment (subject_id, cfitem_id)
SELECT s.id, v.cfitem_id FROM exercizer.subject AS s, (VALUES ('033657b6-54cc-5c4d-a1b3-584dcb811df2'), ('7be43dc1-c092-5083-a181-6d55d8c0bab0')) AS v(cfitem_id)
WHERE s.owner = 'open-ent-catalogue' AND s.is_library_subject = true AND s.title = 'Citoyenneté et institutions'
ON CONFLICT DO NOTHING;
