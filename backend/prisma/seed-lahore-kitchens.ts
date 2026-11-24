/**
 * Kitchens for the four Lahore launch areas (Askari 11, DHA 9 Town, DHA Phase 5, DHA Phase 6): 14 kitchens in
 * different niches, 2 to 6 dishes each, approved and with photos so customers see them. Accounts sign in as
 * first.last@nuray.test with Password123!. Safe to run again: a kitchen whose email exists is skipped.
 *
 *   cd backend && npm run seed:lahore
 */
import bcrypt from 'bcrypt';
import prisma from '../src/config/database';

type Dish = { name: string; nameUrdu: string; price: number; unit: string; type: string; image: string; description: string };
type Kitchen = {
  area: string; owner: string; email: string; business: string; urdu: string; type: 'home_kitchen' | 'restaurant';
  addr: string; cover: string; prep: number; about: string; tags: string[]; dishes: Dish[];
};

/** An Unsplash food photo, each checked by eye against its dish. */
const img = (photoId: string, w: number) => `https://images.unsplash.com/photo-${photoId}?w=${w}&q=80&auto=format&fit=crop`;

const d = (name: string, nameUrdu: string, price: number, unit: string, type: string, image: string, description: string): Dish =>
  ({ name, nameUrdu, price, unit, type, image, description });

const KITCHENS: Kitchen[] = [
  // ── Askari 11 ──
  { area: 'askari-11', owner: 'Shabnam Riaz', email: 'shabnam.riaz@nuray.test', business: "Nani Jaan's Handi", urdu: 'نانی جان کی ہانڈی', type: 'home_kitchen', addr: 'House 27, Street 3, Sector B, Askari 11', cover: '1603894584373-5ac82b2ae398', prep: 35,
    about: 'Everyday Lahori ghar ka khana cooked in small handis, the way Nani Jaan taught: slow bhuna masalas and fresh rotis.', tags: ['Desi', 'Karahi', 'Daily Meals'],
    dishes: [
      d('Desi Chicken Karahi (Half kg)', 'دیسی چکن کڑاہی (آدھا کلو)', 1150, '500g', 'ready_to_eat', '1603894584373-5ac82b2ae398', 'Bone-in chicken cooked on high flame with tomatoes, green chillies and ginger, finished with fresh coriander.'),
      d('Aloo Gosht Shorba', 'آلو گوشت شوربہ', 850, 'portion', 'ready_to_eat', '1596797038530-2c107229654b', 'Tender beef and potatoes in a thin, peppery shorba. Best with two fresh chapatis.'),
      d('Daal Chawal with Achaar', 'دال چاول اور اچار', 450, 'portion', 'ready_to_eat', '1476718406336-bb5a9690ee2a', 'Yellow masoor daal tempered with zeera and garlic, steamed basmati and Nani’s mango achaar.'),
      d('Shahi Chicken Qorma', 'شاہی چکن قورمہ', 980, 'portion', 'ready_to_eat', '1565557623262-b51c2513a641', 'Chicken in a rich brown-onion and yoghurt gravy with kewra and whole spices. Two naans on the side.'),
      d('Ghar Ka Khana Thali', 'گھر کا کھانا تھالی', 750, 'portion', 'ready_to_eat', '1585937421612-70a008356fbe', 'Today’s salan, daal, rice, raita and salad on one tray. Changes daily.'),
      d('Bhuna Keema Matar', 'بھنا قیمہ مٹر', 820, 'portion', 'ready_to_eat', '1588166524941-3bf61a9c41db', 'Beef mince roasted dry with peas, tomatoes and garam masala.'),
    ] },
  { area: 'askari-11', owner: 'Hira Malik', email: 'hira.malik@nuray.test', business: 'Crumb & Co. by Hira', urdu: 'کرمب اینڈ کو بائی حرا', type: 'home_kitchen', addr: 'House 9, Street 12, Sector C, Askari 11', cover: '1578985545062-69928b1d9587', prep: 60,
    about: 'A small home bakery making fudgy cakes, brownies and cookies to order, baked fresh the same morning.', tags: ['Bakery', 'Cakes', 'Desserts'],
    dishes: [
      d('Chocolate Fudge Cake (2 lb)', 'چاکلیٹ فج کیک (2 پاؤنڈ)', 2800, 'piece', 'fresh', '1578985545062-69928b1d9587', 'Moist chocolate sponge layered and covered with dark chocolate fudge frosting.'),
      d('Walnut Fudge Brownies (Box of 6)', 'اخروٹ فج براؤنیز (6 کا ڈبہ)', 1200, 'box', 'fresh', '1606313564200-e75d5e30476c', 'Dense, gooey brownies with a crackly top and toasted walnuts.'),
      d('Chunky Chocolate Chip Cookies (Dozen)', 'چاکلیٹ چپ کوکیز (درجن)', 950, 'dozen', 'fresh', '1558961363-fa8fdf82db35', 'Brown-butter cookies loaded with milk and dark chocolate chunks.'),
    ] },
  { area: 'askari-11', owner: 'Ayesha Tariq', email: 'ayesha.tariq@nuray.test', business: 'Fit Fuel Kitchen', urdu: 'فٹ فیول کچن', type: 'home_kitchen', addr: 'House 44, Street 6, Sector A, Askari 11', cover: '1546069901-ba9599a7e63c', prep: 25,
    about: 'Calorie-counted meals for people who train: lean protein, whole grains and fresh greens, no shortcuts.', tags: ['Healthy', 'High Protein', 'Salads'],
    dishes: [
      d('Grilled Chicken Protein Bowl', 'گرلڈ چکن پروٹین باؤل', 1050, 'bowl', 'ready_to_eat', '1546069901-ba9599a7e63c', 'Herb-grilled chicken breast, brown rice, boiled egg, red cabbage and tahini dressing. About 550 kcal.'),
      d('Classic Chicken Caesar Salad', 'چکن سیزر سلاد', 950, 'bowl', 'ready_to_eat', '1546793665-c74683f339c1', 'Romaine, grilled chicken, parmesan and garlic croutons with a light yoghurt Caesar dressing.'),
      d('Quinoa Veggie Grain Bowl', 'کینوا ویجی باؤل', 900, 'bowl', 'ready_to_eat', '1547592180-85f173990554', 'Quinoa with roasted vegetables, chickpeas and lemon herb dressing. Vegetarian.'),
    ] },
  { area: 'askari-11', owner: 'Imran Qureshi', email: 'imran.qureshi@nuray.test', business: 'Anarkali Grill House', urdu: 'انارکلی گرل ہاؤس', type: 'restaurant', addr: 'Plot 3, Commercial Area, Askari 11', cover: '1555939594-58d7cb561ad1', prep: 30,
    about: 'Charcoal BBQ in the old Anarkali style: seekh, tikka and boti grilled to order over coal.', tags: ['BBQ', 'Tikka', 'Kebabs'],
    dishes: [
      d('Beef Seekh Kebab (4 Skewers)', 'بیف سیخ کباب (4 سیخیں)', 980, 'portion', 'ready_to_eat', '1599487488170-d11ec9c172f0', 'Hand-minced beef with onion, green chilli and roasted spices, grilled over charcoal.'),
      d('Chicken Tikka (Quarter)', 'چکن تکہ (کوارٹر)', 650, 'piece', 'ready_to_eat', '1626074353765-517a681e40be', 'Leg quarter marinated overnight in yoghurt and red chilli, charred on coal.'),
      d('Mixed BBQ Platter for Two', 'مکس باربی کیو پلیٹر (دو افراد)', 2950, 'platter', 'ready_to_eat', '1555939594-58d7cb561ad1', 'Seekh kebab, chicken tikka, malai boti and reshmi kebab with naans, raita and chutney.'),
      d('Malai Boti (10 Pieces)', 'ملائی بوٹی (10 ٹکڑے)', 1100, 'portion', 'ready_to_eat', '1610057099443-fde8c4d50f91', 'Boneless chicken in cream, cheese and white pepper marinade, grilled soft and smoky.'),
      d('Reshmi Kofta Gravy', 'ریشمی کوفتہ گریوی', 1050, 'portion', 'ready_to_eat', '1529042410759-befb1204b468', 'Silky chicken koftas simmered in a light tomato and cream gravy.'),
    ] },

  // ── DHA 9 Town ──
  { area: 'dha-9-town', owner: 'Rubina Aslam', email: 'rubina.aslam@nuray.test', business: 'Freezer Friends by Rubina', urdu: 'فریزر فرینڈز بائی روبینہ', type: 'home_kitchen', addr: 'House 112, Block C, DHA 9 Town', cover: '1601050690597-df0568f70950', prep: 15,
    about: 'Home-made frozen snacks for busy families and Ramzan iftars: fry straight from the freezer.', tags: ['Frozen', 'Snacks', 'Iftar'],
    dishes: [
      d('Chicken Qeema Samosa (Pack of 12)', 'چکن قیمہ سموسہ (12 کا پیک)', 900, 'pack', 'frozen', '1601050690597-df0568f70950', 'Crisp patti samosas filled with spiced chicken mince. Fry from frozen in 6 minutes.'),
      d('Aloo Matar Samosa (Pack of 12)', 'آلو مٹر سموسہ (12 کا پیک)', 650, 'pack', 'frozen', '1601050690117-94f5f6fa8bd7', 'Potato and pea filling with coriander and green chilli. Comes with imli chutney.'),
      d('Crispy Chicken Nuggets (500 g)', 'کرسپی چکن نگٹس (500 گرام)', 1100, 'pack', 'frozen', '1608039755401-742074f0548d', 'Chicken breast nuggets in a crunchy crumb, no fillers. Air-fryer friendly.'),
      d('Chicken Momos (Pack of 15)', 'چکن مومو (15 کا پیک)', 950, 'pack', 'frozen', '1534422298391-e4f8c172dddb', 'Steamed dumplings with ginger-garlic chicken filling and a red chilli dip.'),
      d('Khasta Kachori (Pack of 10)', 'خستہ کچوری (10 کا پیک)', 700, 'pack', 'frozen', '1563245372-f21724e3856d', 'Flaky kachoris with spiced moong daal filling. Fry and serve with aloo tarkari.'),
    ] },
  { area: 'dha-9-town', owner: 'Sana Iqbal', email: 'sana.iqbal@nuray.test', business: 'Pasta Paisano by Sana', urdu: 'پاستا پائیسانو بائی ثنا', type: 'home_kitchen', addr: 'House 58, Block D, DHA 9 Town', cover: '1621996346565-e3dbc646d9a9', prep: 30,
    about: 'Italian home cooking from fresh tomato sauces and hand-stretched dough, adjusted for Lahori spice.', tags: ['Italian', 'Pasta', 'Pizza'],
    dishes: [
      d('Spicy Penne Arrabbiata', 'اسپائسی پینی اربیاٹا', 1050, 'portion', 'ready_to_eat', '1621996346565-e3dbc646d9a9', 'Penne in a slow-cooked tomato, garlic and red chilli sauce, finished with parmesan.'),
      d('Chicken Pesto Pasta Salad', 'چکن پیسٹو پاستا سلاد', 950, 'bowl', 'ready_to_eat', '1473093295043-cdd812d0e601', 'Farfalle with grilled chicken, cherry tomatoes and basil pesto. Served chilled.'),
      d('Thin Crust Spinach & Feta Pizza (10")', 'پالک اور فیٹا پیزا (10 انچ)', 1650, 'piece', 'ready_to_eat', '1593560708920-61dd98c46a4e', 'Hand-stretched thin base with garlic oil, spinach, feta and mozzarella.'),
    ] },
  { area: 'dha-9-town', owner: 'Kashif Mehmood', email: 'kashif.mehmood@nuray.test', business: 'Subah Ka Nashta', urdu: 'صبح کا ناشتہ', type: 'home_kitchen', addr: 'House 7, Block A, DHA 9 Town', cover: '1525351484163-7529414344d8', prep: 20,
    about: 'Weekend-style breakfasts every day, from desi cholay to fluffy pancakes, delivered hot from 7 am.', tags: ['Breakfast', 'Brunch', 'Desi Nashta'],
    dishes: [
      d('Fried Egg & Cheese Toast', 'فرائیڈ انڈا اور چیز ٹوسٹ', 450, 'portion', 'ready_to_eat', '1525351484163-7529414344d8', 'Thick brioche toast with melted cheddar and a runny fried egg.'),
      d('Banana Honey French Toast', 'کیلا اور شہد فرنچ ٹوسٹ', 650, 'portion', 'ready_to_eat', '1484723091739-30a097e8f929', 'Custard-soaked bread, pan-fried golden, with banana, berries and honey.'),
      d('Buttermilk Pancake Stack', 'بٹر ملک پین کیکس', 700, 'portion', 'ready_to_eat', '1528207776546-365bb710ee93', 'Four fluffy pancakes with butter and maple syrup.'),
      d('Avocado & Egg Toast', 'ایووکاڈو اور انڈا ٹوسٹ', 850, 'portion', 'ready_to_eat', '1541519227354-08fa5d50c44d', 'Sourdough with smashed avocado, soft-boiled egg and chilli flakes.'),
      d('Lahori Cholay with Kulchay', 'لاہوری چھولے اور کلچے', 550, 'portion', 'ready_to_eat', '1606491956689-2ea866880c84', 'Spicy chickpea cholay with soft butter kulchay, onion and lemon.'),
    ] },
  { area: 'dha-9-town', owner: 'Faisal Chaudhry', email: 'faisal.chaudhry@nuray.test', business: 'Wok Street', urdu: 'ووک اسٹریٹ', type: 'restaurant', addr: 'Shop 14, Main Boulevard, DHA 9 Town', cover: '1585032226651-759b368d7246', prep: 25,
    about: 'Pakistani-Chinese favourites tossed in a blazing wok: chow mein, fried rice and soups.', tags: ['Chinese', 'Noodles', 'Soups'],
    dishes: [
      d('Chicken Chow Mein', 'چکن چاؤ مین', 950, 'portion', 'ready_to_eat', '1585032226651-759b368d7246', 'Wok-tossed noodles with chicken, cabbage, capsicum and soy.'),
      d('Egg Fried Rice', 'انڈا فرائیڈ رائس', 750, 'portion', 'ready_to_eat', '1512058564366-18510be2db19', 'Fried rice with scrambled egg, spring onion and peas.'),
      d('Spicy Chicken Ramen Bowl', 'اسپائسی چکن رامن', 1250, 'bowl', 'ready_to_eat', '1569718212165-3a8278d5f624', 'Noodles in a rich chicken broth with soft egg, chicken and chilli oil.'),
      d('Hot & Sour Soup (Family)', 'ہاٹ اینڈ ساور سوپ (فیملی)', 900, 'bowl', 'ready_to_eat', '1617093727343-374698b1b08d', 'Thick, peppery soup with chicken, egg ribbons and vinegar. Serves three.'),
      d('Steamed Chicken Dumplings (8)', 'اسٹیمڈ چکن ڈمپلنگز (8)', 850, 'portion', 'ready_to_eat', '1534422298391-e4f8c172dddb', 'Juicy chicken dumplings with soy-chilli dipping sauce.'),
    ] },

  // ── DHA Phase 5 ──
  { area: 'dha-phase-5', owner: 'Mehwish Siddiqui', email: 'mehwish.siddiqui@nuray.test', business: 'Meethi Yaadein', urdu: 'میٹھی یادیں', type: 'home_kitchen', addr: 'House 210, Block K, DHA Phase 5', cover: '1565958011703-44f9829ba187', prep: 45,
    about: 'Celebration cakes and sweet treats for birthdays, dawats and chai time.', tags: ['Desserts', 'Cakes', 'Sweets'],
    dishes: [
      d('Strawberry Cream Cake (2 lb)', 'اسٹرابیری کریم کیک (2 پاؤنڈ)', 3200, 'piece', 'fresh', '1565958011703-44f9829ba187', 'Vanilla sponge with fresh cream and strawberries.'),
      d('Triple Chocolate Brownie Slab', 'ٹرپل چاکلیٹ براؤنی', 1400, 'box', 'fresh', '1570145820259-b5b80c5c8bd6', 'Dark, milk and white chocolate in one fudgy slab, cut into 9 squares.'),
      d('Glazed Mini Doughnuts (Box of 12)', 'گلیزڈ منی ڈونٹس (12 کا ڈبہ)', 1100, 'box', 'fresh', '1551024601-bec78aea704b', 'Soft yeast doughnuts with chocolate glaze and sprinkles.'),
    ] },
  { area: 'dha-phase-5', owner: 'Gul Khan', email: 'gul.khan@nuray.test', business: 'Peshawar Darbar by Gul Khan', urdu: 'پشاور دربار بائی گل خان', type: 'home_kitchen', addr: 'House 88, Block H, DHA Phase 5', cover: '1642821373181-696a54913e93', prep: 40,
    about: 'Namak mandi flavours from Peshawar: mutton karahi with only salt and tomatoes, Kabuli pulao and grilled lamb.', tags: ['Peshawari', 'Mutton', 'Pulao'],
    dishes: [
      d('Kabuli Pulao with Mutton', 'کابلی پلاؤ مٹن کے ساتھ', 1450, 'portion', 'ready_to_eat', '1642821373181-696a54913e93', 'Fragrant rice with tender mutton, caramelised carrots and raisins.'),
      d('Peshawari Mutton Karahi (Half kg)', 'پشاوری مٹن کڑاہی (آدھا کلو)', 2400, '500g', 'ready_to_eat', '1631452180519-c014fe946bc7', 'Mutton cooked in its own fat with tomatoes, salt and green chillies, the namak mandi way.'),
      d('Namak Mandi Chicken Tikka', 'نمک منڈی چکن تکہ', 700, 'piece', 'ready_to_eat', '1626074353765-517a681e40be', 'Chicken marinated simply in salt and spice, slow-grilled over coal.'),
      d('Dumba Ribs (Half kg)', 'دنبہ ریبز (آدھا کلو)', 2600, '500g', 'ready_to_eat', '1544025162-d76694265947', 'Lamb ribs slow-roasted until tender, finished on the grill.'),
      d('Lamb Kofta with Naan', 'لیمب کوفتہ نان کے ساتھ', 1250, 'portion', 'ready_to_eat', '1529042410759-befb1204b468', 'Spiced lamb koftas in a light tomato gravy with two naans.'),
    ] },
  { area: 'dha-phase-5', owner: 'Saba Nadeem', email: 'saba.nadeem@nuray.test', business: 'Little Lunchbox', urdu: 'لٹل لنچ باکس', type: 'home_kitchen', addr: 'House 19, Block L, DHA Phase 5', cover: '1626645738196-c2a7c87a8f58', prep: 20,
    about: 'Kid-approved lunches made at home: no MSG, real chicken and small portions for school boxes.', tags: ['Kids Meals', 'Lunchbox', 'Fast Food'],
    dishes: [
      d('Crispy Chicken & Fries Box', 'کرسپی چکن اور فرائز باکس', 750, 'box', 'ready_to_eat', '1626645738196-c2a7c87a8f58', 'Three pieces of home-fried chicken with seasoned fries and ketchup.'),
      d('Mini Beef Burgers (Pack of 2)', 'منی بیف برگر (2 کا پیک)', 850, 'pack', 'ready_to_eat', '1550547660-d9450f859349', 'Two small beef burgers with cheese and a mild sauce, sized for kids.'),
    ] },

  // ── DHA Phase 6 ──
  { area: 'dha-phase-6', owner: 'Nasreen Akhtar', email: 'nasreen.akhtar@nuray.test', business: "Bibi's Degi Biryani", urdu: 'بی بی کی دیگی بریانی', type: 'home_kitchen', addr: 'House 301, Block C, DHA Phase 6', cover: '1563379091339-03b21ab4a4f8', prep: 45,
    about: 'Biryani and pulao cooked in a real deg on wood fire, from a family recipe that feeds every wedding in the family.', tags: ['Biryani', 'Pulao', 'Degi'],
    dishes: [
      d('Degi Chicken Biryani (Per kg)', 'دیگی چکن بریانی (فی کلو)', 1600, 'kg', 'ready_to_eat', '1563379091339-03b21ab4a4f8', 'Layered biryani with aloo, plums and kewra, cooked on dum. Raita and salad included.'),
      d('Mutton Yakhni Pulao (Per kg)', 'مٹن یخنی پلاؤ (فی کلو)', 2300, 'kg', 'ready_to_eat', '1633945274405-b6c8069047b0', 'Rice cooked in rich mutton yakhni with whole spices and tender meat.'),
    ] },
  { area: 'dha-phase-6', owner: 'Farah Naz', email: 'farah.naz@nuray.test', business: 'Ghar Ka Tiffin by Farah', urdu: 'گھر کا ٹفن بائی فرح', type: 'home_kitchen', addr: 'House 46, Block E, DHA Phase 6', cover: '1546833999-b9f581a1996d', prep: 30,
    about: 'Daily lunch tiffins for offices and students: home salans, fresh rotis and a different menu every day.', tags: ['Tiffin', 'Home Food', 'Office Lunch'],
    dishes: [
      d('Daily Lunch Tiffin', 'روزانہ لنچ ٹفن', 650, 'box', 'ready_to_eat', '1546833999-b9f581a1996d', 'Salan of the day, daal, rice and two rotis in a sealed tiffin.'),
      d('Daal Mash Tarka', 'دال ماش تڑکا', 480, 'portion', 'ready_to_eat', '1476718406336-bb5a9690ee2a', 'Dry white lentils with butter tarka, ginger and green chillies.'),
      d('Chicken Salan with Rice', 'چکن سالن اور چاول', 750, 'portion', 'ready_to_eat', '1585937421612-70a008356fbe', 'Home-style chicken curry with plain basmati rice.'),
      d('Aloo Keema with 2 Rotis', 'آلو قیمہ اور دو روٹیاں', 700, 'portion', 'ready_to_eat', '1588166524941-3bf61a9c41db', 'Beef mince and potatoes in a homely masala, with two tandoori rotis.'),
      d('Vegetable Thali', 'سبزی تھالی', 600, 'portion', 'ready_to_eat', '1625398407796-82650a8c135f', 'Three seasonal sabzis, daal, rice and raita. Fully vegetarian.'),
      d('Chicken Handi (Half kg)', 'چکن ہانڈی (آدھا کلو)', 1200, '500g', 'ready_to_eat', '1596797038530-2c107229654b', 'Boneless chicken in a creamy yoghurt and tomato handi masala.'),
    ] },
  { area: 'dha-phase-6', owner: 'Hamza Rauf', email: 'hamza.rauf@nuray.test', business: 'Smash Republic', urdu: 'اسمیش ریپبلک', type: 'restaurant', addr: 'Shop 5, Y Block Commercial, DHA Phase 6', cover: '1571091718767-18b5b1457add', prep: 20,
    about: 'Smashed beef burgers, crunchy zingers and loaded fries made to order.', tags: ['Burgers', 'Fast Food', 'Fries'],
    dishes: [
      d('Double Smash Burger', 'ڈبل اسمیش برگر', 1350, 'piece', 'ready_to_eat', '1571091718767-18b5b1457add', 'Two smashed beef patties, American cheese, pickles and house sauce on a potato bun.'),
      d('Crispy Zinger Burger', 'کرسپی زنگر برگر', 850, 'piece', 'ready_to_eat', '1606755962773-d324e0a13086', 'Spicy fried chicken fillet, lettuce and garlic mayo.'),
      d('Loaded Cheese Fries', 'لوڈڈ چیز فرائز', 750, 'portion', 'ready_to_eat', '1573080496219-bb080dd4f877', 'Fries topped with cheese sauce, jalapeños and chicken chunks.'),
    ] },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export async function seedLahoreKitchens() {
  const hash = await bcrypt.hash('Password123!', 10);
  const areas = Object.fromEntries((await prisma.community.findMany({ where: { slug: { in: [...new Set(KITCHENS.map((k) => k.area))] } } })).map((c) => [c.slug, c]));
  let n = 0, dishes = 0;
  for (const [i, k] of KITCHENS.entries()) {
    const c = areas[k.area];
    if (!c) throw new Error('missing area ' + k.area);
    if (await prisma.user.findUnique({ where: { email: k.email } })) { console.log('exists, skipped:', k.email); continue; }
    // Spread kitchens within about 1 km of the area centre so maps and distances look real.
    const lat = Number(c.centerLatitude) + (((i * 37) % 17) - 8) * 0.001;
    const lng = Number(c.centerLongitude) + (((i * 53) % 17) - 8) * 0.001;
    const user = await prisma.user.create({
      data: {
        email: k.email, passwordHash: hash, phone: `+92300555${String(i + 1).padStart(4, '0')}`,
        userType: 'seller', status: 'active', emailVerified: true, phoneVerified: true,
        profile: { create: { fullName: k.owner, city: 'Lahore', area: c.name } },
      },
    });
    const seller = await prisma.seller.create({
      data: {
        userId: user.id, businessName: k.business, businessNameUrdu: k.urdu, businessType: k.type,
        description: k.about, coverImageUrl: img(k.cover, 800), mealCategories: k.tags,
        isVerified: true, verificationStatus: 'approved', status: 'active',
        communityId: c.id, primaryCommunityName: c.name, allowCrossCommunity: true, freeDeliveryAreas: [c.name],
        latitude: lat, longitude: lng, deliveryModes: ['delivery', 'pickup'], pickupAddress: `${k.addr}, Lahore`,
        scheduleMode: '24_7', minPrepTimeMinutes: k.prep, deliveryProvider: 'platform',
      },
    });
    for (const x of k.dishes) {
      await prisma.product.create({
        data: {
          sellerId: seller.id, name: x.name, nameUrdu: x.nameUrdu, slug: `${slugify(x.name)}-${seller.id.slice(0, 6)}`,
          description: x.description, price: x.price, unit: x.unit, productType: x.type, stockType: 'direct',
          stockQuantity: 40, isActive: true, approvalStatus: 'approved', preparationTime: k.prep,
          images: { create: { imageUrl: img(x.image, 600), isPrimary: true, sortOrder: 0 } },
        },
      });
      dishes++;
    }
    n++;
    console.log(`${c.name.padEnd(12)} ${k.business} (${k.dishes.length} dishes)`);
  }
  console.log(`created ${n} kitchens, ${dishes} dishes`);
}

if (require.main === module) {
  seedLahoreKitchens()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
