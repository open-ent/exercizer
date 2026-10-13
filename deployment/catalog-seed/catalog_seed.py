#!/usr/bin/env python3
"""
Jeu d'exercices du catalogue Open ENT — source de la migration src/main/resources/sql/042-catalog-seed.sql.

Exercices ORIGINAUX, rédigés pour Open ENT (aucune reprise d'un site tiers). Chaque sujet est classé
par niveau(x) et matière(s) avec les CODES du référentiel (sql/041-subject-catalog.sql), jamais par id.

Régénérer la migration :
    python3 deployment/catalog-seed/catalog_seed.py > src/main/resources/sql/042-catalog-seed.sql

⚠ Une migration ne se rejoue pas : une fois 042 passée en production, toute correction ou tout ajout
part dans une NOUVELLE migration (043…), sans modifier 042.
"""
import json
import sys

OWNER_ID = "open-ent-catalogue"
OWNER_NAME = "Open ENT"
AUTHORS = "Équipe pédagogique Open ENT"

# ── Fabriques de grains (formats de frontend/src/grains.ts#defaultCustomData) ────────────────────


def statement(title, html):
    return (3, {"title": title, "max_score": 0, "custom_data": {"title": title, "statement": html}})


def simple(title, question, answer, score=1, hint=None, explanation=None):
    return (4, _with(title, question, score, hint, explanation, {"correct_answer": answer}))


def open_q(title, question, score=2, hint=None, explanation=None):
    return (5, _with(title, question, score, hint, explanation, {}))


def multiple(title, question, answers, score=2, hint=None, explanation=None):
    return (6, _with(title, question, score, hint, explanation, {
        "correct_answer_list": [{"text": a} for a in answers], "no_error_allowed": False}))


def qcm(title, question, good, bad, score=1, hint=None, explanation=None):
    """`good` : une réponse (str) ou plusieurs (list) ; l'ordre d'affichage alterne bonnes et mauvaises."""
    goods = [good] if isinstance(good, str) else list(good)
    choices = [{"text": g, "isChecked": True} for g in goods] + [{"text": b, "isChecked": False} for b in bad]
    # Mélange déterministe : la bonne réponse n'est pas toujours la première.
    shift = len(question) % len(choices)
    choices = choices[shift:] + choices[:shift]
    return (7, _with(title, question, score, hint, explanation, {
        "correct_answer_list": choices, "no_error_allowed": False, "multipleAnswers": len(goods) > 1}))


def association(title, question, pairs, score=2, hint=None, explanation=None):
    return (8, _with(title, question, score, hint, explanation, {
        "correct_answer_list": [{"text_left": l, "text_right": r} for l, r in pairs],
        "no_error_allowed": False, "show_left_column": True}))


def order(title, question, items, score=2, hint=None, explanation=None):
    """`items` dans le BON ordre."""
    return (9, _with(title, question, score, hint, explanation, {
        "correct_answer_list": [{"text": t, "order_by": i + 1} for i, t in enumerate(items)],
        "no_error_allowed": False}))


def _with(title, question, score, hint, explanation, custom):
    data = {"title": title, "max_score": score, "statement": f"<p>{question}</p>", "custom_data": custom}
    if hint:
        data["answer_hint"] = hint
    if explanation:
        data["answer_explanation"] = f"<p>{explanation}</p>"
    return data


def subject(title, description, levels, disciplines, grains):
    return {"title": title, "description": f"<p>{description}</p>", "levels": levels,
            "disciplines": disciplines, "grains": grains}


# ── Les sujets ────────────────────────────────────────────────────────────────────────────────────

SUBJECTS = [
    # ── Maternelle ────────────────────────────────────────────────────────────────────────────────
    subject("Les couleurs et les formes", "Reconnaître des formes simples et associer des objets à leur couleur. À faire avec l'adulte qui lit les consignes.",
            ["MS", "GS"], ["EXPLORER_LE_MONDE"], [
        statement("Consigne", "<p>L'adulte lit chaque question à voix haute. L'enfant montre ou dit sa réponse.</p>"),
        association("Chaque objet a sa couleur", "Relie chaque objet à sa couleur habituelle.",
                    [("La banane", "jaune"), ("La fraise", "rouge"), ("L'herbe", "verte"), ("Le ciel sans nuage", "bleu")]),
        qcm("Une forme ronde", "Quelle forme est toute ronde ?", "Le cercle", ["Le carré", "Le triangle"]),
        qcm("Trois côtés", "Quelle forme a trois côtés ?", "Le triangle", ["Le cercle", "Le rectangle"]),
        simple("Compter les côtés", "Combien de côtés a un carré ? (écris le nombre en chiffres)", "4"),
    ]),
    subject("Les sons du début des mots", "Entendre le premier son d'un mot : une étape vers la lecture.",
            ["GS", "CP"], ["LANGAGE", "FRANCAIS"], [
        qcm("Le son [m]", "Quel mot commence par le son [m] ?", "moto", ["vélo", "train"]),
        qcm("Le son [s]", "Quel mot commence par le son [s] ?", "soleil", ["lune", "nuage"]),
        multiple("Le son [p]", "Écris deux mots de cette liste qui commencent par le son [p] : papa, maman, pomme, tomate.", ["papa", "pomme"]),
        association("Même premier son", "Associe les mots qui commencent par le même son.",
                    [("lapin", "lune"), ("chat", "chapeau"), ("bateau", "ballon")]),
    ]),

    # ── CP ────────────────────────────────────────────────────────────────────────────────────────
    subject("Additions jusqu'à 10", "Calculer de petites sommes et décomposer les nombres jusqu'à 10.",
            ["CP"], ["MATHEMATIQUES"], [
        statement("Consigne", "<p>Calcule de tête. Tu peux t'aider de tes doigts.</p>"),
        simple("3 + 4", "Combien font 3 + 4 ?", "7"),
        simple("5 + 5", "Combien font 5 + 5 ?", "10"),
        simple("Le complément à 10", "6 + ... = 10. Quel nombre manque ?", "4", hint="Compte de 6 jusqu'à 10."),
        qcm("Une autre écriture de 8", "Quelle addition est égale à 8 ?", "4 + 4", ["3 + 4", "6 + 3"]),
        order("Du plus petit au plus grand", "Range ces nombres du plus petit au plus grand.", ["2", "5", "7", "9"]),
    ]),
    subject("Lire des mots simples", "Lire des syllabes et des mots courts, reconnaître les mots-outils.",
            ["CP"], ["FRANCAIS"], [
        association("Syllabes et mots", "Associe chaque début de mot à sa fin pour former un mot.",
                    [("la", "pin"), ("mou", "ton"), ("vé", "lo")]),
        qcm("Le bon mot", "Quel mot désigne un animal ?", "chat", ["table", "porte"]),
        simple("Le mot manquant", "Complète : « Le chat ... sur le lit. » (dort / dorts)", "dort"),
        qcm("Le petit mot", "Complète : « Je joue ... mon ami. »", "avec", ["sur", "sous"]),
    ]),
    subject("Le jour et la nuit, les saisons", "Se repérer dans le temps : jours de la semaine et saisons.",
            ["CP", "CE1"], ["QUESTIONNER_LE_MONDE"], [
        order("Les jours de la semaine", "Range ces jours dans l'ordre, en commençant par lundi.",
              ["lundi", "mardi", "mercredi", "jeudi", "vendredi"]),
        simple("Après dimanche", "Quel jour vient après dimanche ?", "lundi"),
        order("Les saisons", "Range les saisons dans l'ordre, en commençant par le printemps.",
              ["printemps", "été", "automne", "hiver"]),
        qcm("La saison froide", "En quelle saison fait-il le plus froid en France ?", "l'hiver", ["l'été", "le printemps"]),
    ]),

    # ── CE1 ───────────────────────────────────────────────────────────────────────────────────────
    subject("Additions et soustractions jusqu'à 100", "Calcul posé ou mental avec des nombres à deux chiffres.",
            ["CE1"], ["MATHEMATIQUES"], [
        simple("Une somme", "Calcule 23 + 15.", "38"),
        simple("Une différence", "Calcule 47 - 12.", "35"),
        simple("Avec une retenue", "Calcule 38 + 27.", "65", hint="8 + 7 = 15 : pose 5 et retiens 1."),
        qcm("Le problème des billes", "Léa a 30 billes. Elle en gagne 12. Combien en a-t-elle maintenant ?", "42", ["18", "32"]),
        simple("Les dizaines", "Combien y a-t-il de dizaines dans 70 ?", "7"),
    ]),
    subject("Le nom et le verbe", "Repérer le verbe et le nom dans une phrase simple.",
            ["CE1", "CE2"], ["FRANCAIS"], [
        statement("Rappel", "<p>Le <strong>verbe</strong> dit ce que l'on fait. Le <strong>nom</strong> désigne une personne, un animal ou une chose.</p>"),
        qcm("Trouver le verbe", "Dans la phrase « Le chien court dans le jardin », quel est le verbe ?", "court", ["chien", "jardin"]),
        multiple("Trouver les noms", "Écris les deux noms de la phrase : « La fille mange une pomme. »", ["fille", "pomme"]),
        association("Nom ou verbe ?", "Associe chaque mot à sa nature.",
                    [("chanter", "verbe"), ("maison", "nom"), ("sauter", "verbe"), ("oiseau", "nom")]),
    ]),
    subject("Les animaux et leur milieu", "Associer les animaux à leur milieu de vie et à leur alimentation.",
            ["CE1", "CE2"], ["QUESTIONNER_LE_MONDE"], [
        association("Où vivent-ils ?", "Associe chaque animal à son milieu de vie.",
                    [("Le poisson", "l'eau"), ("La taupe", "sous la terre"), ("L'écureuil", "la forêt"), ("Le chameau", "le désert")]),
        qcm("Un herbivore", "Quel animal mange uniquement des végétaux ?", "le lapin", ["le loup", "le renard"]),
        qcm("Les mammifères", "Quels animaux sont des mammifères ?", ["la vache", "la baleine"], ["la poule", "le requin"], score=2),
        open_q("Observer", "Cite un animal que tu peux observer près de chez toi et décris où il vit.", score=2),
    ]),
    subject("Les nombres en anglais", "Compter de 1 à 10 en anglais.",
            ["CE1", "CE2"], ["LANGUES_VIVANTES"], [
        association("Les nombres", "Associe chaque nombre à son nom en anglais.",
                    [("1", "one"), ("3", "three"), ("5", "five"), ("8", "eight"), ("10", "ten")]),
        simple("Two", "Écris en chiffres : two.", "2"),
        qcm("Seven", "Comment dit-on 7 en anglais ?", "seven", ["six", "nine"]),
    ]),

    # ── CE2 ───────────────────────────────────────────────────────────────────────────────────────
    subject("Les tables de multiplication", "Mémoriser les tables de 2, 3, 4 et 5.",
            ["CE2"], ["MATHEMATIQUES"], [
        simple("Table de 2", "Combien font 2 x 7 ?", "14"),
        simple("Table de 3", "Combien font 3 x 6 ?", "18"),
        simple("Table de 4", "Combien font 4 x 8 ?", "32"),
        simple("Table de 5", "Combien font 5 x 9 ?", "45"),
        association("Résultats", "Associe chaque multiplication à son résultat.",
                    [("3 x 4", "12"), ("5 x 5", "25"), ("2 x 9", "18"), ("4 x 6", "24")]),
        qcm("Le problème des boîtes", "Une boîte contient 6 œufs. Combien d'œufs y a-t-il dans 5 boîtes ?", "30", ["11", "25"]),
    ]),
    subject("Le présent de l'indicatif", "Conjuguer les verbes du 1er groupe et être, avoir au présent.",
            ["CE2", "CM1"], ["FRANCAIS"], [
        simple("Chanter", "Conjugue « chanter » avec « nous » au présent : nous ...", "chantons"),
        simple("Être", "Conjugue « être » avec « vous » au présent : vous ...", "êtes"),
        qcm("Avoir", "Complète : « Ils ... un chien. »", "ont", ["sont", "on"]),
        association("Sujets et verbes", "Associe chaque sujet au verbe « jouer » bien conjugué.",
                    [("je", "joue"), ("tu", "joues"), ("nous", "jouons"), ("ils", "jouent")]),
    ]),
    subject("Le cycle de l'eau", "Comprendre les états de l'eau et son parcours dans la nature.",
            ["CE2", "CM1"], ["QUESTIONNER_LE_MONDE", "SCIENCES_TECHNO"], [
        association("Les états de l'eau", "Associe chaque forme de l'eau à son état.",
                    [("la glace", "solide"), ("la pluie", "liquide"), ("la vapeur", "gazeux")]),
        order("Le parcours de l'eau", "Remets les étapes du cycle de l'eau dans l'ordre, en partant de la mer.",
              ["évaporation de l'eau de mer", "formation des nuages", "pluie", "ruissellement vers les rivières"]),
        qcm("La température de fusion", "À quelle température la glace fond-elle ?", "0 °C", ["10 °C", "100 °C"]),
    ]),

    # ── CM1 ───────────────────────────────────────────────────────────────────────────────────────
    subject("Les fractions simples", "Lire, écrire et comparer des fractions simples.",
            ["CM1"], ["MATHEMATIQUES"], [
        statement("Rappel", "<p>Dans la fraction 3/4, le <strong>dénominateur</strong> 4 indique en combien de parts égales on partage ; le <strong>numérateur</strong> 3 indique combien de parts on prend.</p>"),
        qcm("La moitié", "Quelle fraction représente la moitié ?", "1/2", ["1/3", "2/3"]),
        simple("Le dénominateur", "Quel est le dénominateur de la fraction 5/8 ?", "8"),
        qcm("Comparer", "Quelle fraction est la plus grande ?", "3/4", ["1/4", "2/4"]),
        association("Fractions et écritures", "Associe chaque fraction à son écriture en lettres.",
                    [("1/2", "un demi"), ("1/4", "un quart"), ("3/4", "trois quarts"), ("1/3", "un tiers")]),
    ]),
    subject("Les grandes périodes de l'histoire", "Situer les grandes périodes historiques dans l'ordre.",
            ["CM1", "CM2"], ["HISTOIRE_GEO"], [
        order("La frise", "Range les périodes de l'histoire dans l'ordre chronologique.",
              ["la Préhistoire", "l'Antiquité", "le Moyen Âge", "les Temps modernes", "l'époque contemporaine"]),
        qcm("Le début de l'Antiquité", "Quel événement marque le début de l'Antiquité ?", "l'invention de l'écriture", ["la découverte du feu", "la prise de la Bastille"]),
        association("Personnages", "Associe chaque personnage à sa période.",
                    [("Vercingétorix", "l'Antiquité"), ("Charlemagne", "le Moyen Âge"), ("Louis XIV", "les Temps modernes")]),
        simple("Une date", "En quelle année a eu lieu la prise de la Bastille ?", "1789"),
    ]),
    subject("Les accords dans le groupe nominal", "Accorder le déterminant, le nom et l'adjectif.",
            ["CM1", "CM2"], ["FRANCAIS"], [
        qcm("Au pluriel", "Quel groupe nominal est bien accordé ?", "des chevaux blancs", ["des cheval blancs", "des chevaux blanc"]),
        simple("Au féminin", "Écris au féminin : « un chat gris » → « une chatte ... »", "grise"),
        simple("Le pluriel en -aux", "Écris le pluriel de « un journal » : des ...", "journaux"),
        open_q("À toi d'écrire", "Écris une phrase avec un groupe nominal au féminin pluriel contenant un adjectif.", score=2),
    ]),
    subject("Daily routine", "Décrire sa journée en anglais avec des verbes du quotidien.",
            ["CM1", "CM2"], ["LANGUES_VIVANTES"], [
        association("Les verbes", "Associe chaque verbe anglais à sa traduction.",
                    [("to wake up", "se réveiller"), ("to eat", "manger"), ("to go to school", "aller à l'école"), ("to sleep", "dormir")]),
        order("Ma journée", "Range ces actions dans l'ordre d'une journée.",
              ["I wake up", "I have breakfast", "I go to school", "I go to bed"]),
        qcm("Quelle heure ?", "« It's seven o'clock » signifie :", "Il est sept heures", ["Il est six heures", "Il est sept heures et demie"]),
    ]),

    # ── CM2 ───────────────────────────────────────────────────────────────────────────────────────
    subject("Les nombres décimaux", "Comprendre, comparer et calculer avec les nombres décimaux.",
            ["CM2", "6E"], ["MATHEMATIQUES"], [
        qcm("Le chiffre des dixièmes", "Dans 12,47, quel est le chiffre des dixièmes ?", "4", ["7", "2"]),
        qcm("Comparer", "Quel nombre est le plus grand ?", "3,5", ["3,45", "3,09"], hint="Compare d'abord les dixièmes."),
        qcm("Une addition", "Combien font 2,5 + 1,25 ?", "3,75", ["3,30", "4,75"]),
        order("Ranger", "Range ces nombres du plus petit au plus grand.", ["0,8", "1,05", "1,5", "2"]),
        qcm("Multiplier par 10", "Combien font 3,14 x 10 ?", "31,4", ["3,140", "314"]),
    ]),
    subject("Les grands repères de la géographie de la France", "Se repérer sur la carte de France : fleuves, montagnes, villes.",
            ["CM2", "6E"], ["HISTOIRE_GEO"], [
        qcm("Le plus long fleuve", "Quel est le plus long fleuve entièrement français ?", "la Loire", ["la Seine", "le Rhône"]),
        association("Fleuves et villes", "Associe chaque fleuve à une ville qu'il traverse.",
                    [("la Seine", "Paris"), ("la Garonne", "Bordeaux"), ("le Rhône", "Lyon"), ("la Loire", "Nantes")]),
        qcm("Le plus haut sommet", "Quel est le plus haut sommet de France ?", "le mont Blanc", ["le puy de Dôme", "le Vignemale"]),
        multiple("Les massifs", "Cite deux massifs montagneux français.", ["les Alpes", "les Pyrénées"], explanation="Autres réponses acceptables : le Massif central, le Jura, les Vosges."),
    ]),
    subject("L'énergie et ses sources", "Distinguer les sources d'énergie renouvelables et non renouvelables.",
            ["CM2", "6E"], ["SCIENCES_TECHNO", "TECHNOLOGIE"], [
        qcm("Renouvelables", "Quelles sources d'énergie sont renouvelables ?", ["le vent", "le soleil"], ["le pétrole", "le charbon"], score=2),
        association("Énergie et appareil", "Associe chaque source d'énergie à l'installation qui l'utilise.",
                    [("le vent", "l'éolienne"), ("le soleil", "le panneau solaire"), ("l'eau d'une rivière", "le barrage")]),
        open_q("Économiser", "Donne deux gestes pour économiser l'énergie à l'école.", score=2),
    ]),

    # ── Collège ───────────────────────────────────────────────────────────────────────────────────
    subject("Proportionnalité", "Reconnaître une situation de proportionnalité et calculer une quatrième proportionnelle.",
            ["6E", "5E"], ["MATHEMATIQUES"], [
        qcm("Le prix des stylos", "3 stylos coûtent 4,50 €. Combien coûtent 5 stylos ?", "7,50 €", ["6,50 €", "9,00 €"], hint="Calcule d'abord le prix d'un stylo.", explanation="Un stylo coûte 4,50 : 3 = 1,50 € ; 5 stylos coûtent 5 x 1,50 = 7,50 €."),
        qcm("Proportionnel ?", "Quelle situation est proportionnelle ?", "Le prix payé et la quantité de pain achetée au même prix au kilo", ["L'âge et la taille d'un enfant", "La pointure et l'âge"]),
        simple("Un pourcentage", "Combien font 20 % de 50 ?", "10"),
        simple("L'échelle", "Sur une carte au 1/100 000, 1 cm représente combien de kilomètres ?", "1"),
    ]),
    subject("Les nombres relatifs", "Comparer et additionner des nombres relatifs.",
            ["5E", "4E"], ["MATHEMATIQUES"], [
        order("Ranger", "Range du plus petit au plus grand.", ["-7", "-2", "0", "3"]),
        simple("Une somme", "Calcule (-5) + 8.", "3"),
        simple("Une différence", "Calcule 4 - 9.", "-5"),
        qcm("Le produit", "Quel est le signe du produit (-3) x (-4) ?", "positif", ["négatif", "nul"]),
    ]),
    subject("Le théorème de Pythagore", "Calculer une longueur dans un triangle rectangle.",
            ["4E"], ["MATHEMATIQUES"], [
        statement("Rappel", "<p>Dans un triangle rectangle, le carré de l'hypoténuse est égal à la somme des carrés des deux autres côtés.</p>"),
        simple("L'hypoténuse", "Un triangle est rectangle ; ses côtés de l'angle droit mesurent 3 cm et 4 cm. Combien mesure l'hypoténuse (en cm) ?", "5", explanation="3² + 4² = 9 + 16 = 25, et √25 = 5."),
        simple("Un côté", "L'hypoténuse mesure 13 cm et un côté 5 cm. Combien mesure le troisième côté (en cm) ?", "12", explanation="13² - 5² = 169 - 25 = 144, et √144 = 12."),
        qcm("Rectangle ?", "Un triangle a pour côtés 6 cm, 8 cm et 10 cm. Est-il rectangle ?", "oui", ["non", "on ne peut pas savoir"]),
    ]),
    subject("Équations du premier degré", "Résoudre des équations simples.",
            ["4E", "3E"], ["MATHEMATIQUES"], [
        simple("Équation 1", "Résous : x + 7 = 12. x = ?", "5"),
        simple("Équation 2", "Résous : 3x = 21. x = ?", "7"),
        simple("Équation 3", "Résous : 2x + 3 = 11. x = ?", "4"),
        qcm("La bonne méthode", "Pour résoudre 5x - 2 = 13, on commence par :", "ajouter 2 aux deux membres", ["diviser par 5 le seul membre de gauche", "soustraire 13 aux deux membres"]),
    ]),
    subject("Les fonctions affines", "Lire et calculer avec une fonction affine.",
            ["3E", "2NDE"], ["MATHEMATIQUES"], [
        simple("Une image", "Soit f(x) = 2x + 1. Calcule f(3).", "7"),
        qcm("Le coefficient directeur", "Quel est le coefficient directeur de f(x) = -3x + 5 ?", "-3", ["5", "3"]),
        qcm("Une fonction linéaire", "Laquelle de ces fonctions est linéaire ?", "g(x) = 4x", ["h(x) = 4x + 1", "k(x) = x²"]),
        simple("Un antécédent", "Soit f(x) = 2x - 4. Quel est l'antécédent de 0 ?", "2"),
    ]),
    subject("Les classes grammaticales", "Identifier la nature des mots dans une phrase.",
            ["6E", "5E"], ["FRANCAIS"], [
        association("Nature des mots", "Associe chaque mot de la phrase « Le petit chat dort paisiblement » à sa nature.",
                    [("Le", "déterminant"), ("petit", "adjectif"), ("chat", "nom"), ("dort", "verbe"), ("paisiblement", "adverbe")], score=3),
        qcm("Pronom", "Dans « Elle lui parle », quels mots sont des pronoms ?", ["Elle", "lui"], ["parle"], score=2),
        open_q("Rédaction", "Écris une phrase contenant un adverbe et souligne-le (écris-le en majuscules).", score=2),
    ]),
    subject("Les figures de style", "Reconnaître comparaison, métaphore, personnification et hyperbole.",
            ["4E", "3E", "2NDE"], ["FRANCAIS"], [
        association("Identifier", "Associe chaque phrase à la figure de style qu'elle contient.",
                    [("Il est fort comme un lion.", "comparaison"), ("Cet homme est un lion.", "métaphore"),
                     ("Le vent hurlait dans la nuit.", "personnification"), ("Je meurs de faim.", "hyperbole")], score=4),
        qcm("Le mot-outil", "Quel mot signale souvent une comparaison ?", "comme", ["et", "donc"]),
        open_q("Créer", "Invente une métaphore pour décrire la mer.", score=2),
    ]),
    subject("La Révolution française", "Les grandes étapes de la Révolution française.",
            ["4E"], ["HISTOIRE_GEO"], [
        order("Chronologie", "Range ces événements dans l'ordre chronologique.",
              ["réunion des États généraux (mai 1789)", "prise de la Bastille (juillet 1789)",
               "Déclaration des droits de l'homme et du citoyen (août 1789)", "proclamation de la République (septembre 1792)"]),
        qcm("La Déclaration", "Quel texte est adopté en août 1789 ?", "la Déclaration des droits de l'homme et du citoyen", ["le Code civil", "la Constitution de la Ve République"]),
        simple("La fête nationale", "Quel jour de l'année célèbre-t-on la fête nationale ? (jour et mois)", "14 juillet"),
        open_q("Expliquer", "Explique en quelques lignes pourquoi l'abolition des privilèges (4 août 1789) est un tournant.", score=3),
    ]),
    subject("La Première Guerre mondiale", "Repères et caractéristiques d'une guerre totale.",
            ["3E"], ["HISTOIRE_GEO"], [
        multiple("Les dates", "Donne l'année du début puis l'année de la fin de la Première Guerre mondiale.", ["1914", "1918"]),
        qcm("Verdun", "En quelle année a eu lieu la bataille de Verdun ?", "1916", ["1914", "1918"]),
        qcm("L'armistice", "Quelle est la date de l'armistice ?", "11 novembre 1918", ["8 mai 1945", "14 juillet 1919"]),
        open_q("Guerre totale", "Pourquoi parle-t-on de « guerre totale » ? Donne deux arguments.", score=3),
    ]),
    subject("La cellule, unité du vivant", "Les constituants de la cellule animale et végétale.",
            ["6E", "5E"], ["SVT"], [
        multiple("Constituants communs", "Cite trois constituants communs aux cellules animales et végétales.", ["noyau", "cytoplasme", "membrane"], score=3),
        qcm("Propre aux végétaux", "Quel élément trouve-t-on seulement dans la cellule végétale ?", "la paroi", ["le noyau", "la membrane"]),
        qcm("Observer", "Quel instrument faut-il pour observer une cellule ?", "un microscope", ["une loupe à main", "une paire de jumelles"]),
    ]),
    subject("La digestion", "Le trajet des aliments et le rôle des organes digestifs.",
            ["5E"], ["SVT"], [
        order("Le trajet", "Range les organes dans l'ordre du trajet des aliments.",
              ["la bouche", "l'œsophage", "l'estomac", "l'intestin grêle", "le gros intestin"]),
        qcm("L'absorption", "Dans quel organe les nutriments passent-ils dans le sang ?", "l'intestin grêle", ["l'estomac", "l'œsophage"]),
        qcm("Les enzymes", "Quel est le rôle des enzymes digestives ?", "découper les aliments en nutriments", ["transporter l'oxygène", "fabriquer des globules"]),
    ]),
    subject("États et changements d'état de la matière", "Solide, liquide, gaz et les changements d'état.",
            ["5E", "4E"], ["PHYSIQUE_CHIMIE"], [
        association("Changements d'état", "Associe chaque changement d'état à son nom.",
                    [("solide → liquide", "fusion"), ("liquide → solide", "solidification"), ("liquide → gaz", "vaporisation"), ("gaz → liquide", "liquéfaction")], score=4),
        qcm("La masse", "Lors d'un changement d'état, la masse :", "se conserve", ["augmente", "diminue"]),
        simple("Ébullition", "À quelle température l'eau pure bout-elle à pression normale ? (en °C, nombre seul)", "100"),
    ]),
    subject("Le circuit électrique", "Réaliser et lire un circuit électrique simple.",
            ["5E", "4E"], ["PHYSIQUE_CHIMIE", "TECHNOLOGIE"], [
        qcm("Circuit fermé", "Pour qu'une lampe brille, le circuit doit être :", "fermé", ["ouvert", "coupé"]),
        qcm("Conducteurs", "Quels matériaux sont des conducteurs électriques ?", ["le cuivre", "l'aluminium"], ["le plastique", "le verre"], score=2),
        simple("La loi d'Ohm", "U = R x I. Avec R = 10 Ω et I = 0,5 A, combien vaut U (en volts) ?", "5"),
    ]),
    subject("Algorithmique et programmation", "Lire un algorithme simple et prévoir son résultat.",
            ["5E", "4E", "3E"], ["TECHNOLOGIE", "MATHEMATIQUES"], [
        simple("Une boucle", "Un lutin avance de 10 pas, et l'on répète cette instruction 4 fois. De combien de pas a-t-il avancé ?", "40"),
        qcm("Une condition", "Quelle instruction exécute une action seulement si une condition est vraie ?", "si … alors", ["répéter 10 fois", "attendre 1 seconde"]),
        simple("Une variable", "On met 5 dans la variable n, puis on ajoute 3 à n. Que vaut n ?", "8"),
        order("Un carré", "Remets dans l'ordre le programme qui trace un carré.",
              ["stylo en position d'écriture", "répéter 4 fois", "avancer de 50", "tourner de 90 degrés"]),
    ]),
    subject("Talking about the past", "Le prétérit des verbes réguliers et irréguliers.",
            ["4E", "3E"], ["LANGUES_VIVANTES"], [
        association("Irregular verbs", "Associe chaque verbe à son prétérit.",
                    [("go", "went"), ("see", "saw"), ("eat", "ate"), ("take", "took")], score=2),
        simple("Regular verb", "Mets au prétérit : « I play football. » → « I ... football. »", "played"),
        qcm("Negative", "Quelle est la forme négative de « She went to London » ?", "She didn't go to London", ["She didn't went to London", "She don't go to London"]),
    ]),

    # ── Lycée ─────────────────────────────────────────────────────────────────────────────────────
    subject("Statistiques descriptives", "Moyenne, médiane et étendue d'une série.",
            ["2NDE"], ["MATHEMATIQUES"], [
        statement("La série", "<p>Notes d'un élève : 8 ; 12 ; 15 ; 10 ; 15.</p>"),
        simple("La moyenne", "Quelle est la moyenne de la série ?", "12"),
        simple("La médiane", "Quelle est la médiane de la série ?", "12"),
        simple("L'étendue", "Quelle est l'étendue de la série ?", "7"),
        qcm("Le mode", "Quelle valeur apparaît le plus souvent ?", "15", ["12", "8"]),
    ]),
    subject("Le second degré", "Forme développée, racines et signe d'un trinôme.",
            ["1ERE"], ["MATHEMATIQUES"], [
        simple("Le discriminant", "Calcule le discriminant de x² - 5x + 6.", "1"),
        multiple("Les racines", "Donne les deux racines de x² - 5x + 6.", ["2", "3"]),
        qcm("Pas de racine", "Si le discriminant est strictement négatif, le trinôme a :", "aucune racine réelle", ["une racine double", "deux racines réelles"]),
    ]),
    subject("Dérivation", "Calculer des dérivées usuelles.",
            ["1ERE", "TLE"], ["MATHEMATIQUES"], [
        association("Dérivées usuelles", "Associe chaque fonction à sa dérivée.",
                    [("x²", "2x"), ("x³", "3x²"), ("1/x", "-1/x²"), ("√x", "1/(2√x)")], score=4),
        simple("Un polynôme", "Quelle est la dérivée de f(x) = 3x² + 2x ? (écris sous la forme ax+b, ex. 6x+2)", "6x+2"),
        qcm("Sens de variation", "Si f'(x) > 0 sur un intervalle, f est sur cet intervalle :", "croissante", ["décroissante", "constante"]),
    ]),
    subject("La conscience et l'inconscient", "Notions et auteurs : un premier parcours de philosophie.",
            ["TLE"], ["PHILOSOPHIE"], [
        association("Auteurs et thèses", "Associe chaque auteur à une idée qui lui est attachée.",
                    [("Descartes", "« Je pense, donc je suis »"), ("Freud", "l'inconscient psychique"), ("Socrate", "« Connais-toi toi-même »")], score=3),
        qcm("Le cogito", "Le cogito cartésien établit d'abord la certitude :", "de l'existence du sujet pensant", ["de l'existence du monde extérieur", "de l'existence des autres"]),
        open_q("Dissertation (introduction)", "Rédige une problématique pour le sujet : « Peut-on se connaître soi-même ? »", score=4),
    ]),
    subject("Le marché et la formation des prix", "Offre, demande et équilibre de marché.",
            ["2NDE", "1ERE"], ["SES"], [
        qcm("La demande", "Toutes choses égales par ailleurs, quand le prix augmente, la quantité demandée :", "diminue", ["augmente", "ne change pas"]),
        qcm("L'équilibre", "Le prix d'équilibre est le prix pour lequel :", "l'offre est égale à la demande", ["l'offre est maximale", "la demande est nulle"]),
        association("Vocabulaire", "Associe chaque terme à sa définition.",
                    [("offreur", "celui qui vend un bien ou un service"), ("demandeur", "celui qui souhaite acheter"), ("pénurie", "demande supérieure à l'offre")], score=3),
    ]),
    subject("Mouvement et vitesse", "Calculer une vitesse moyenne et décrire un mouvement.",
            ["2NDE"], ["PHYSIQUE_CHIMIE"], [
        simple("Vitesse moyenne", "Un cycliste parcourt 30 km en 1,5 h. Quelle est sa vitesse moyenne en km/h ?", "20"),
        simple("Conversion", "Convertis 36 km/h en m/s (nombre seul).", "10", hint="Divise par 3,6."),
        qcm("Le référentiel", "Un passager assis dans un train qui roule est immobile par rapport :", "au train", ["au quai", "aux arbres"]),
    ]),
    subject("Internet et le Web", "Distinguer Internet et le Web, comprendre une adresse.",
            ["2NDE"], ["SNT"], [
        qcm("Internet ou Web ?", "Le Web est :", "un service qui fonctionne grâce à Internet", ["un synonyme exact d'Internet", "un câble sous-marin"]),
        association("Protocoles", "Associe chaque protocole à son rôle.",
                    [("HTTP", "transférer des pages web"), ("IP", "adresser et acheminer les paquets"), ("DNS", "traduire un nom de domaine en adresse IP")], score=3),
        qcm("HTTPS", "Que garantit le « S » de HTTPS ?", "le chiffrement des échanges", ["la rapidité du site", "la gratuité du site"]),
    ]),
    subject("La Guerre froide", "Un monde bipolaire de 1947 à 1991.",
            ["TLE", "3E"], ["HISTOIRE_GEO"], [
        association("Les deux blocs", "Associe chaque bloc à sa puissance dominante.",
                    [("bloc de l'Ouest", "les États-Unis"), ("bloc de l'Est", "l'URSS")]),
        order("Chronologie", "Range ces événements dans l'ordre chronologique.",
              ["blocus de Berlin (1948)", "crise de Cuba (1962)", "chute du mur de Berlin (1989)", "disparition de l'URSS (1991)"]),
        open_q("Expliquer", "Pourquoi parle-t-on de guerre « froide » ?", score=3),
    ]),
    subject("Citoyenneté et institutions", "Les principes et institutions de la République.",
            ["CM2", "3E"], ["EMC"], [
        multiple("La devise", "Cite les trois mots de la devise de la République française.", ["Liberté", "Égalité", "Fraternité"], score=3),
        qcm("Le vote", "À partir de quel âge peut-on voter en France ?", "18 ans", ["16 ans", "21 ans"]),
        association("Institutions", "Associe chaque institution à son rôle.",
                    [("le Parlement", "vote les lois"), ("le Gouvernement", "conduit la politique de la nation"), ("les juges", "rendent la justice")], score=3),
    ]),
]


# ── Production du SQL ─────────────────────────────────────────────────────────────────────────────


def lit(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def codes(values):
    return "ARRAY[" + ", ".join(lit(v) for v in values) + "]::varchar[]"


def render(subjects):
    out = [
        "-- Jeu d'exercices du catalogue Open ENT : exercices ORIGINAUX, classés par niveau et matière.",
        "-- Fichier GÉNÉRÉ par deployment/catalog-seed/catalog_seed.py — ne pas modifier à la main.",
        "-- Les sujets appartiennent à un usager technique (pas de compte ENT) : ils ne dépendent d'aucun",
        "-- établissement, et seul un modérateur du catalogue (exercizer.catalog.manage) peut les retirer.",
        "",
        f"INSERT INTO exercizer.users (id, username, is_deleted) VALUES ({lit(OWNER_ID)}, {lit(OWNER_NAME)}, false)",
        "\tON CONFLICT (id) DO NOTHING;",
        "",
    ]
    for s in subjects:
        for code in s["levels"]:
            assert code, s["title"]
        max_score = sum(g[1].get("max_score", 0) for g in s["grains"])
        grains = ",\n\t\t".join(
            f"({t}, {i + 1}, {lit(json.dumps(d, ensure_ascii=False))})" for i, (t, d) in enumerate(s["grains"]))
        out.append(f"""-- {s['title']}
WITH s AS (
\tINSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
\t\tis_library_subject, is_deleted, authors_contributors, type)
\tVALUES (NULL, {lit(OWNER_ID)}, {lit(OWNER_NAME)}, {lit(s['title'])}, {lit(s['description'])}, {max_score},
\t\ttrue, false, {lit(AUTHORS)}, 'interactive')
\tRETURNING id
), l AS (
\tINSERT INTO exercizer.subject_level (subject_id, level_id)
\tSELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY({codes(s['levels'])})
), d AS (
\tINSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
\tSELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY({codes(s['disciplines'])})
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
\t\t{grains}
\t) AS v(t, o, d);
""")
    return "\n".join(out)


KNOWN_LEVELS = {"PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2", "6E", "5E", "4E", "3E", "2NDE", "1ERE", "TLE"}
KNOWN_DISCIPLINES = {"MATHEMATIQUES", "FRANCAIS", "QUESTIONNER_LE_MONDE", "SCIENCES_TECHNO", "EXPLORER_LE_MONDE",
                     "LANGAGE", "LANGUES_VIVANTES", "HISTOIRE_GEO", "SVT", "PHYSIQUE_CHIMIE", "TECHNOLOGIE",
                     "PHILOSOPHIE", "SES", "SNT", "EMC"}

if __name__ == "__main__":
    for s in SUBJECTS:
        unknown = (set(s["levels"]) - KNOWN_LEVELS) | (set(s["disciplines"]) - KNOWN_DISCIPLINES)
        if unknown:
            sys.exit(f"Code inconnu dans « {s['title']} » : {unknown}")
    titles = [s["title"] for s in SUBJECTS]
    if len(titles) != len(set(titles)):
        sys.exit("Deux sujets portent le même titre.")
    sys.stdout.write(render(SUBJECTS))
