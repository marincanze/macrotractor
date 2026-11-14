/* Vgrajena baza osnovnih živil (vrednosti na 100 g iz običajnih prehranskih tabel) in
   iskanje po njej. Omogoča vnos pogostih živil brez Clauda – takoj in vedno z istimi vrednostmi.

   Stolpci: [ime sl, ime en, kcal, beljakovine, OH, maščobe, nasičene, sladkorji, vlaknine, sol,
             ocena zdravja 1–10, običajna porcija v g, dodatne iskalne besede] */

const FOOD_DB = [
  // meso, ribe, jajca
  ["Piščančje prsi, surove", "Chicken breast, raw", 120, 22.5, 0, 2.6, 0.6, 0, 0, 0.1, 9, 150, "piščanec file pišče"],
  ["Piščančje prsi, pečene", "Chicken breast, cooked", 165, 31, 0, 3.6, 1, 0, 0, 0.2, 9, 130, "piščanec file pišče"],
  ["Piščančja bedra, pečena", "Chicken thigh, cooked", 180, 25, 0, 8.5, 2.3, 0, 0, 0.2, 8, 130, "piščanec stegna"],
  ["Puranje prsi, surove", "Turkey breast, raw", 110, 24, 0, 1.5, 0.4, 0, 0, 0.1, 9, 150, "puran file"],
  ["Govedina, pusta, surova", "Beef, lean, raw", 127, 21.5, 0, 4.5, 1.8, 0, 0, 0.1, 8, 150, "goveji zrezek steak biftek"],
  ["Mleta govedina, surova", "Ground beef, raw", 215, 18.5, 0, 15, 6, 0, 0, 0.2, 6, 125, "mleto meso"],
  ["Mleto mešano meso, surovo", "Ground pork & beef, raw", 240, 17, 0, 19, 7.5, 0, 0, 0.2, 5, 125, "mleto meso"],
  ["Svinjski zrezek, surov", "Pork loin, raw", 145, 21.5, 0, 6.5, 2.3, 0, 0, 0.1, 7, 150, "svinjina kare"],
  ["Slanina", "Bacon", 415, 13, 0.5, 40, 14, 0, 0, 2, 2, 30, "panceta špeh"],
  ["Kuhana šunka", "Cooked ham", 105, 18, 1.5, 3, 1.1, 1, 0, 2, 4, 50, "šunka salama"],
  ["Pršut", "Prosciutto", 250, 28, 0.3, 15, 5.5, 0, 0, 5.5, 3, 40, ""],
  ["Salama", "Salami / luncheon meat", 250, 12, 1.5, 22, 8, 0.5, 0, 2.2, 2, 40, "posebna"],
  ["Hrenovka", "Frankfurter", 270, 12, 2, 24, 9, 1, 0, 2, 2, 100, "hrenovke klobasa"],
  ["Čevapčiči", "Ćevapi", 250, 16, 1.5, 20, 8, 0.5, 0, 1.8, 3, 150, "čevapi"],
  ["Tuna v lastnem soku", "Tuna in water, drained", 110, 25, 0, 1, 0.3, 0, 0, 1, 8, 100, "tunina konzerva"],
  ["Tuna v olju, odcejena", "Tuna in oil, drained", 190, 26, 0, 9.5, 1.5, 0, 0, 1, 7, 100, "tunina konzerva"],
  ["Losos, surov", "Salmon, raw", 205, 20, 0, 13.5, 3, 0, 0, 0.1, 9, 150, "riba file"],
  ["Bela riba, surova", "White fish, raw", 85, 18, 0, 1.3, 0.3, 0, 0, 0.2, 9, 150, "oslič file riba brancin"],
  ["Kozice", "Shrimp", 85, 18, 0.5, 1, 0.2, 0, 0, 0.6, 8, 100, "gamberi škampi"],
  ["Jajce", "Egg", 143, 12.6, 0.7, 9.5, 3.1, 0.4, 0, 0.36, 8, 55, "jajca jajci"],
  ["Jajčni beljak", "Egg white", 52, 11, 0.7, 0.2, 0, 0.7, 0, 0.4, 8, 33, "beljaki"],

  // mlečni izdelki
  ["Mleko 3,5 %", "Whole milk", 64, 3.3, 4.7, 3.5, 2.3, 4.7, 0, 0.1, 6, 250, "polnomastno"],
  ["Mleko 1,5 %", "Semi-skimmed milk", 46, 3.4, 4.8, 1.5, 1, 4.8, 0, 0.1, 7, 250, "pol posneto lahko"],
  ["Jogurt navadni 3,2 %", "Plain yogurt", 62, 3.5, 4.5, 3.2, 2.1, 4.5, 0, 0.1, 7, 180, ""],
  ["Grški jogurt 0 %", "Greek yogurt 0 %", 57, 10.3, 3.6, 0, 0, 3.6, 0, 0.1, 9, 170, ""],
  ["Grški jogurt 5 %", "Greek yogurt 5 %", 95, 9, 3, 5, 3.3, 3, 0, 0.1, 8, 170, ""],
  ["Skyr navadni", "Skyr, plain", 63, 11, 4, 0.2, 0.1, 4, 0, 0.1, 9, 150, ""],
  ["Pusta skuta", "Low-fat quark", 73, 13, 4, 0.5, 0.3, 3.5, 0, 0.1, 9, 125, "skuta"],
  ["Zrnati sir", "Cottage cheese", 98, 11, 3.4, 4.3, 2.7, 2.7, 0, 0.9, 8, 150, "cottage"],
  ["Sir (edamec, gavda)", "Cheese (Edam, Gouda)", 350, 25, 0.5, 27.5, 18, 0, 0, 1.8, 5, 30, "poltrdi sir"],
  ["Mozzarella", "Mozzarella", 250, 18, 2, 19, 13, 1, 0, 0.5, 6, 60, "mocarela"],
  ["Feta", "Feta", 265, 14, 4, 21.5, 15, 1, 0, 2.5, 5, 40, "sir"],
  ["Parmezan", "Parmesan", 400, 36, 3, 27, 17.5, 0, 0, 1.6, 5, 15, "sir"],
  ["Maslo", "Butter", 740, 0.7, 0.7, 82, 52, 0.7, 0, 0.02, 3, 10, ""],
  ["Smetana za kuhanje 20 %", "Cooking cream 20 %", 205, 3, 4, 20, 13, 4, 0, 0.1, 3, 50, ""],
  ["Kisla smetana 20 %", "Sour cream 20 %", 205, 3, 3.5, 20, 13, 3.5, 0, 0.1, 3, 30, ""],
  ["Beljakovine v prahu (whey)", "Whey protein powder", 390, 78, 7, 5.5, 3, 6, 0, 0.5, 6, 30, "protein proteini sirotka"],

  // žita, priloge, kruh
  ["Riž beli, surov", "White rice, raw", 350, 7, 78.5, 0.6, 0.2, 0.1, 1.3, 0, 6, 75, "basmati"],
  ["Riž beli, kuhan", "White rice, cooked", 130, 2.7, 28, 0.3, 0.1, 0.1, 0.4, 0, 6, 180, "basmati"],
  ["Testenine, suhe", "Pasta, dry", 355, 12.5, 71.5, 1.5, 0.3, 3, 3, 0, 6, 90, "špageti makaroni"],
  ["Testenine, kuhane", "Pasta, cooked", 155, 5.5, 31, 0.9, 0.2, 0.6, 1.8, 0, 6, 220, "špageti makaroni"],
  ["Ovseni kosmiči", "Rolled oats", 370, 13.5, 59, 7, 1.3, 1, 10, 0, 9, 50, "oves"],
  ["Kruh beli", "White bread", 265, 9, 49, 3.2, 0.7, 3, 2.7, 1.2, 4, 50, "toast"],
  ["Kruh polnozrnati", "Wholegrain bread", 245, 10, 41, 3.5, 0.6, 4, 7, 1.1, 7, 50, ""],
  ["Kruh črni (rženi)", "Rye bread", 250, 8.5, 46, 2.5, 0.4, 3, 5.5, 1.2, 6, 50, ""],
  ["Žemlja", "Bread roll", 280, 9, 54, 2.5, 0.5, 3, 2.5, 1.3, 4, 60, "kajzerica štručka"],
  ["Tortilja pšenična", "Wheat tortilla", 300, 8, 50, 7, 3, 2.5, 2.5, 1.3, 4, 60, "wrap"],
  ["Krompir, surov", "Potato, raw", 77, 2, 17, 0.1, 0, 0.8, 2.2, 0, 8, 200, ""],
  ["Krompir, kuhan", "Potato, boiled", 85, 1.9, 19, 0.1, 0, 0.8, 1.8, 0, 8, 200, ""],
  ["Pomfri", "French fries", 290, 3.5, 38, 14, 2, 0.5, 3.5, 0.6, 3, 150, "pomfrit pečen krompirček"],
  ["Pire krompir", "Mashed potatoes", 105, 2, 15, 4, 2.4, 1.5, 1.3, 0.5, 5, 200, ""],
  ["Sladki krompir", "Sweet potato", 86, 1.6, 17, 0.1, 0, 4.2, 3, 0.1, 9, 200, "batata"],
  ["Kuskus, suh", "Couscous, dry", 360, 12.5, 72, 1.5, 0.3, 2, 5, 0, 6, 70, ""],
  ["Kvinoja, surova", "Quinoa, raw", 360, 14, 58, 6, 0.7, 2, 7, 0, 9, 70, ""],
  ["Ajdova kaša, surova", "Buckwheat groats, raw", 345, 13, 61, 3.4, 0.7, 1, 10, 0, 9, 70, "ajda"],
  ["Polenta, suha", "Polenta, dry", 350, 8, 75, 1.5, 0.2, 0.6, 3, 0, 6, 70, "koruzni zdrob"],
  ["Koruzni kosmiči", "Corn flakes", 375, 7, 84, 0.9, 0.2, 8, 3, 1.1, 4, 40, "cornflakes"],
  ["Musli", "Muesli", 360, 9, 63, 6.5, 1.5, 22, 8, 0.1, 6, 50, "müsli"],
  ["Granola", "Granola", 450, 9, 62, 17, 4, 22, 6, 0.1, 5, 50, "hrustljavi musli"],
  ["Moka bela", "White flour", 345, 10, 72, 1, 0.2, 1, 3, 0, 5, 100, "pšenična"],

  // stročnice
  ["Fižol, kuhan", "Beans, cooked", 105, 7.5, 14.5, 0.5, 0.1, 0.5, 6.5, 0.6, 9, 150, "konzerva"],
  ["Čičerika, kuhana", "Chickpeas, cooked", 140, 8, 18.5, 2.5, 0.3, 1, 7, 0.5, 9, 150, "konzerva"],
  ["Leča, kuhana", "Lentils, cooked", 110, 9, 12.5, 0.4, 0.1, 1.8, 7.5, 0, 9, 150, ""],
  ["Tofu", "Tofu", 127, 13.5, 1.5, 7.5, 1.2, 0.5, 1, 0, 8, 125, ""],
  ["Humus", "Hummus", 240, 7, 11, 18, 2.2, 0.5, 5, 1, 7, 50, "hummus"],

  // zelenjava
  ["Brokoli", "Broccoli", 34, 2.8, 4, 0.4, 0.1, 1.7, 2.6, 0, 10, 150, ""],
  ["Cvetača", "Cauliflower", 25, 1.9, 3, 0.3, 0.1, 1.9, 2, 0, 10, 150, ""],
  ["Korenje", "Carrot", 38, 0.9, 7, 0.2, 0, 4.7, 2.8, 0.1, 10, 100, "korenček"],
  ["Paradižnik", "Tomato", 18, 0.9, 2.7, 0.2, 0, 2.6, 1.2, 0, 10, 120, ""],
  ["Kumara", "Cucumber", 14, 0.7, 2.2, 0.1, 0, 1.7, 0.5, 0, 10, 150, "kumare"],
  ["Paprika", "Bell pepper", 28, 1, 4.6, 0.3, 0, 4.2, 1.8, 0, 10, 150, ""],
  ["Zelena solata", "Lettuce", 15, 1.4, 1.5, 0.2, 0, 0.8, 1.3, 0, 10, 80, "solata"],
  ["Špinača", "Spinach", 23, 2.9, 1.4, 0.4, 0.1, 0.4, 2.2, 0.2, 10, 100, ""],
  ["Bučke", "Zucchini", 17, 1.2, 2.1, 0.3, 0.1, 2.1, 1, 0, 10, 200, ""],
  ["Čebula", "Onion", 38, 1.1, 7.6, 0.1, 0, 4.2, 1.7, 0, 10, 80, ""],
  ["Šampinjoni", "Mushrooms", 24, 3.1, 2.3, 0.3, 0, 2, 1, 0, 10, 150, "gobe"],
  ["Zelje", "Cabbage", 25, 1.3, 3.5, 0.1, 0, 3.2, 2.5, 0, 10, 150, ""],
  ["Stročji fižol", "Green beans", 31, 1.8, 3.6, 0.2, 0, 3.3, 3.4, 0, 10, 150, ""],
  ["Koruza sladka", "Sweetcorn", 80, 2.7, 15, 1.2, 0.2, 5, 2.5, 0.5, 8, 100, "konzerva"],
  ["Grah", "Peas", 78, 5.4, 9, 0.4, 0.1, 5, 5.5, 0, 9, 100, ""],
  ["Avokado", "Avocado", 160, 2, 1.8, 14.7, 2.1, 0.7, 6.7, 0, 9, 100, ""],
  ["Olive", "Olives", 145, 1, 0.5, 15, 2, 0, 3, 3, 6, 30, "oljke"],

  // sadje
  ["Jabolko", "Apple", 52, 0.3, 11.4, 0.2, 0, 10.4, 2.4, 0, 9, 180, "jabolka"],
  ["Banana", "Banana", 89, 1.1, 20.2, 0.3, 0.1, 12.2, 2.6, 0, 9, 120, ""],
  ["Pomaranča", "Orange", 47, 0.9, 9.4, 0.1, 0, 9.4, 2.4, 0, 9, 180, ""],
  ["Mandarina", "Mandarin", 53, 0.8, 11.5, 0.3, 0, 10.6, 1.8, 0, 9, 80, "klementina"],
  ["Hruška", "Pear", 57, 0.4, 12.1, 0.1, 0, 9.8, 3.1, 0, 9, 180, ""],
  ["Jagode", "Strawberries", 32, 0.7, 5.7, 0.3, 0, 4.9, 2, 0, 9, 150, ""],
  ["Borovnice", "Blueberries", 57, 0.7, 12.1, 0.3, 0, 10, 2.4, 0, 9, 100, ""],
  ["Maline", "Raspberries", 50, 1.2, 5.4, 0.7, 0, 4.4, 6.5, 0, 9, 100, ""],
  ["Grozdje", "Grapes", 69, 0.7, 17.2, 0.2, 0.1, 15.5, 0.9, 0, 8, 150, ""],
  ["Kivi", "Kiwi", 61, 1.1, 11.7, 0.5, 0, 9, 3, 0, 9, 75, ""],
  ["Lubenica", "Watermelon", 30, 0.6, 7.2, 0.2, 0, 6.2, 0.4, 0, 9, 300, ""],
  ["Ananas", "Pineapple", 50, 0.5, 11.7, 0.1, 0, 9.9, 1.4, 0, 9, 150, ""],
  ["Breskev", "Peach", 39, 0.9, 8, 0.3, 0, 8, 1.5, 0, 9, 150, "nektarina"],
  ["Češnje", "Cherries", 63, 1.1, 13.9, 0.2, 0, 12.8, 2.1, 0, 9, 100, ""],
  ["Rozine", "Raisins", 300, 3.1, 69, 0.5, 0.1, 59, 3.7, 0, 6, 30, ""],
  ["Datlji", "Dates", 280, 2.5, 67, 0.4, 0, 63, 8, 0, 6, 30, ""],

  // oreščki, semena, maščobe
  ["Mandlji", "Almonds", 580, 21, 9, 50, 3.8, 4.4, 12.5, 0, 8, 30, ""],
  ["Orehi", "Walnuts", 655, 15, 7, 65, 6.1, 2.6, 6.7, 0, 8, 30, ""],
  ["Lešniki", "Hazelnuts", 630, 15, 7, 61, 4.5, 4.3, 9.7, 0, 8, 30, ""],
  ["Arašidi", "Peanuts", 570, 26, 8, 49, 6.8, 4, 8.5, 0, 7, 30, "kikiriki"],
  ["Indijski oreščki", "Cashews", 555, 18, 27, 44, 7.8, 6, 3.3, 0, 7, 30, "indijski oreh"],
  ["Arašidovo maslo", "Peanut butter", 600, 25, 12, 50, 10, 6, 6, 0.7, 6, 20, ""],
  ["Chia semena", "Chia seeds", 450, 17, 8, 31, 3.3, 0, 34, 0, 9, 15, ""],
  ["Laneno seme", "Flaxseed", 535, 18, 1.6, 42, 3.7, 1.5, 27, 0.1, 9, 10, "lanena semena"],
  ["Sončnična semena", "Sunflower seeds", 585, 21, 11.4, 51.5, 4.5, 2.6, 8.6, 0, 8, 20, ""],
  ["Olivno olje", "Olive oil", 900, 0, 0, 100, 14, 0, 0, 0, 7, 10, "oljčno olje"],
  ["Sončnično olje", "Sunflower oil", 900, 0, 0, 100, 10, 0, 0, 0, 5, 10, "jedilno olje"],
  ["Majoneza", "Mayonnaise", 700, 1, 1.5, 77, 6, 1.3, 0, 1.2, 2, 15, ""],

  // sladko, prigrizki
  ["Mlečna čokolada", "Milk chocolate", 535, 7.5, 57, 30, 18.5, 55, 2, 0.25, 2, 25, ""],
  ["Temna čokolada 70 %", "Dark chocolate 70 %", 580, 8, 35, 42, 25, 28, 11, 0, 4, 20, "jedilna čokolada"],
  ["Lešnikov namaz", "Hazelnut spread", 539, 6.3, 57.5, 30.9, 10.6, 56.3, 0, 0.1, 2, 15, "nutella čokoladni"],
  ["Med", "Honey", 320, 0.3, 80, 0, 0, 80, 0, 0, 3, 15, ""],
  ["Sladkor", "Sugar", 400, 0, 100, 0, 0, 100, 0, 0, 1, 5, ""],
  ["Marmelada", "Jam", 250, 0.4, 60, 0.1, 0, 55, 1, 0, 3, 20, "džem"],
  ["Masleni piškoti", "Butter biscuits", 480, 6.5, 68, 20, 9, 24, 2.5, 0.8, 2, 30, "keksi"],
  ["Čips", "Potato chips", 535, 6.5, 50, 33, 3, 0.5, 4.5, 1.3, 2, 50, ""],
  ["Sladoled vaniljev", "Vanilla ice cream", 205, 3.5, 23.5, 11, 7, 21, 0, 0.1, 2, 100, ""],
  ["Rogljiček", "Croissant", 410, 8, 45, 21.5, 12, 8, 2.5, 1, 2, 60, "rogljič"],
  ["Krof", "Doughnut", 400, 6, 48, 20, 8, 18, 1.5, 0.6, 2, 70, ""],

  // pripravljene jedi
  ["Pica margerita", "Pizza margherita", 250, 11, 31, 9, 4, 3, 2, 1.3, 4, 350, "pizza"],
  ["Burek mesni", "Meat burek", 290, 10, 27, 16, 6, 1.5, 1.5, 1.4, 3, 250, ""],
  ["Burek sirni", "Cheese burek", 280, 9, 27, 15, 7, 1.5, 1.2, 1.3, 3, 250, "sirov"],
  ["Kebab v lepinji", "Döner kebab", 215, 11, 20, 10, 3.5, 2.5, 1.5, 1.3, 4, 350, ""],
  ["Hamburger", "Hamburger", 255, 13, 24, 12, 4.5, 4.5, 1.5, 1.2, 3, 220, "burger"],
  ["Dunajski zrezek, piščančji", "Chicken schnitzel", 240, 19, 12, 13, 2.5, 0.5, 0.8, 0.9, 4, 150, "ocvrt piščanec"],
  ["Goveja juha z rezanci", "Beef noodle soup", 30, 1.5, 4, 0.8, 0.3, 0.3, 0.3, 0.8, 6, 300, ""],

  // pijače
  ["Pomarančni sok", "Orange juice", 45, 0.7, 10, 0.2, 0, 9, 0.2, 0, 5, 250, ""],
  ["Kola", "Cola", 42, 0, 10.6, 0, 0, 10.6, 0, 0, 1, 330, "coca cola kokakola"],
  ["Bela kava", "Coffee with milk", 40, 2.1, 3.1, 2.1, 1.4, 3.1, 0, 0.1, 6, 200, "kava z mlekom kapučino cappuccino"],
  ["Ovseni napitek", "Oat drink", 45, 1, 6.7, 1.5, 0.2, 4, 0.8, 0.1, 6, 250, "ovseno mleko"],
  ["Pivo", "Beer", 43, 0.4, 3.4, 0, 0, 0, 0, 0, 2, 500, ""],
  ["Vino", "Wine", 85, 0.1, 2.6, 0, 0, 0.6, 0, 0, 2, 150, ""],
];

const FOOD_COLS = ["kcal", "protein", "carbs", "fat", "sat_fat", "sugar", "fiber", "salt"];

// brez šumnikov in velikih črk, za primerjavo
const foldText = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// slovenske končnice: »jajci«, »jajca«, »jajce« → »jaj«; kratke besede ostanejo cele
const stemWord = (w) => (w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w);

// besede, ki opisujejo količino ali povezujejo, ne pa živila
const FILLER = new Set("kos kosa kosi kose kosov rezina rezine rezini zlica zlice zlicka skodelica skodelice kozarec kozarca krožnik kroznik porcija porcije malo velik veliko pol en ena eno dva dve tri in ter za na piece pieces slice slices cup cups glass spoon of and the some".split(" "));

/* Iz besedila prebere količino: »150 g riža«, »2 dl mleka«, »2 jajci«, »riž 80g«.
   Vrne { query, grams } ali { query, count } ali samo { query }. */
function parseAmount(text) {
  let q = " " + foldText(text).replace(",", ".") + " ";
  let grams = null, count = null;
  const unit = q.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|dl|l)\b/);
  if (unit) {
    grams = +unit[1] * { kg: 1000, g: 1, ml: 1, dl: 100, l: 1000 }[unit[2]];
    q = q.replace(unit[0], " ");
  } else {
    const n = q.match(/\s(\d+(?:\.\d+)?)\s*x?\s/);
    if (n && +n[1] > 0 && +n[1] <= 20) {
      count = +n[1];
      q = q.replace(n[0], " ");
    }
  }
  return { query: q.replace(/\s+/g, " ").trim(), grams, count };
}

// koliko se iskane besede ujemajo z imenom (0 = se ne)
function matchScore(words, hay) {
  const hw = hay.split(/[^a-z0-9%]+/).filter(Boolean);
  let score = 0;
  for (const w of words) {
    const st = stemWord(w);
    const i = hw.findIndex((h) => h.startsWith(st));
    if (i === -1) return 0;
    // ujemanje s prvo besedo imena in natančnejše ujemanje štejeta več
    score += (i === 0 ? 3 : 1) + (hw[i].startsWith(w) ? 2 : 0);
  }
  return score;
}

/* Poišče živila po besedilu. `own` so uporabnikova živila (hitra izbira, zgodovina) –
   ta imajo prednost pred vgrajeno bazo. Vrne do `limit` predlogov z vrednostmi za porcijo. */
function searchFoods(text, own = [], limit = 6) {
  const { query, grams, count } = parseAmount(text);
  const words = query.split(" ").filter((w) => w.length >= 2 && !FILLER.has(w));
  if (!words.length) return [];
  const out = [];
  const seen = new Set();

  for (const it of own) {
    const s = matchScore(words, foldText(it.name));
    if (!s) continue;
    const key = foldText(it.name);
    if (seen.has(key)) continue;
    seen.add(key);
    // lastna živila: preračunaj na zahtevano količino, če imajo znano maso
    const g = grams ?? (count && it.grams ? it.grams * count : it.grams);
    const f = it.grams && g ? g / it.grams : count || 1;
    const item = { name: it.name, grams: g || null, health: it.health || null };
    for (const k of FOOD_COLS) item[k] = it[k] == null ? null : it[k] * f;
    out.push({ item, score: s + 4 + (it.fav ? 2 : 0) + Math.min(2, (it.n || 1) / 3), own: true, fav: !!it.fav });
  }

  const en = typeof LANG !== "undefined" && LANG === "en";
  for (const row of FOOD_DB) {
    const name = en ? row[1] : row[0];
    const s = matchScore(words, foldText(`${row[0]} ${row[1]} ${row[12] || ""}`));
    if (!s || seen.has(foldText(name))) continue;
    const g = grams ?? row[11] * (count || 1);
    const item = { name, grams: g, health: row[10] };
    FOOD_COLS.forEach((k, i) => (item[k] = (row[2 + i] * g) / 100));
    // ujemanje z imenom v trenutnem jeziku ima prednost pred iskalnimi besedami
    out.push({ item, score: s + (matchScore(words, foldText(name)) ? 1 : 0), own: false });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// kalorije, izračunane iz makrohranil (vlaknine ≈ 2 kcal/g)
const macroKcal = (it) => 4 * (+it.protein || 0) + 4 * (+it.carbs || 0) + 9 * (+it.fat || 0) + 2 * (+it.fiber || 0);

/* Preveri, ali se kalorije ujemajo z makrohranili. Vrne izračunane kcal, če je razlika
   prevelika, sicer null. Alkohol ima kalorije, ki niso v makrohranilih, zato ga preskoči. */
function kcalMismatch(it) {
  if (/\b(piv|vin|beer|wine|zganj|viski|whisk|vodka|gin|rum|liker|koktajl|cocktail|spric|jabolcnik|cider)/.test(foldText(it.name))) return null;
  const calc = macroKcal(it), kcal = +it.kcal || 0;
  if (Math.abs(calc - kcal) <= Math.max(25, kcal * 0.18)) return null;
  return Math.round(calc);
}
