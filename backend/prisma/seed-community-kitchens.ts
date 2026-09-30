import prisma from '../src/config/database';

export async function seedCommunityKitchens() {
  console.log('🍳 Seeding authentic Karachi and pilot community kitchens with real products & images...');

  // 1. Fetch communities
  const gulshan = await prisma.community.findUnique({ where: { slug: 'gulshan-e-iqbal' } });
  const dhaKarachi = await prisma.community.findUnique({ where: { slug: 'dha-karachi' } });
  const clifton = await prisma.community.findUnique({ where: { slug: 'clifton' } });
  const pechs = await prisma.community.findUnique({ where: { slug: 'pechs' } });
  const northNazimabad = await prisma.community.findUnique({ where: { slug: 'north-nazimabad' } });
  const askari4 = await prisma.community.findUnique({ where: { slug: 'askari-4' } });
  const bahriaTown = await prisma.community.findUnique({ where: { slug: 'bahria-town-karachi' } });

  const askari11 = await prisma.community.findUnique({ where: { slug: 'askari-11' } });
  const askari10 = await prisma.community.findUnique({ where: { slug: 'askari-10' } });
  const dha6 = await prisma.community.findUnique({ where: { slug: 'dha-phase-6' } });
  const dha5 = await prisma.community.findUnique({ where: { slug: 'dha-phase-5' } });

  if (!gulshan || !dhaKarachi || !clifton || !pechs || !northNazimabad || !askari4 || !bahriaTown) {
    throw new Error('Karachi communities not found. Please run seedCommunities first.');
  }

  // Helper to ensure user exists with profile
  async function getOrCreateUser(email: string, fullName: string, phone: string, avatarUrl: string, city: string, area: string) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: '$2b$10$wKxN74bO/nO9gC5E.Eeqp.k/J3zJ62N10r7U5V9b2h9D.c0gK2f0C', // Password123!
          phone,
          userType: 'seller',
          status: 'active',
          profile: {
            create: {
              fullName,
              avatarUrl,
              city,
              area,
            },
          },
        },
      });
    } else {
      // Update profile info
      await prisma.userProfile.upsert({
        where: { userId: user.id },
        update: { fullName, avatarUrl, city, area },
        create: { userId: user.id, fullName, avatarUrl, city, area },
      });
    }
    return user;
  }

  // Kitchen definitions
  const allKitchenDefinitions = [
    // ---------------- Gulshan-e-Iqbal ----------------
    {
      community: gulshan,
      businessName: "Saima's Craft Kitchen",
      email: 'saima.akhtar@nuray.test',
      chef: 'Chef Saima Akhtar',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220001',
      city: 'Karachi',
      area: 'Gulshan-e-Iqbal, Block 4',
      description: 'Generational home recipes passed down from grandmother: golden lachha parathas, shami kebabs, and sub-zero frozen savory snacks.',
      cuisine: ['Desi Ghee Parathas', 'Shami Kebabs', 'Frozen Packs', 'Desi Breakfast'],
      cover: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop',
      rating: 4.85,
      reviews: 245,
      prepTime: 20,
      dishes: [
        {
          name: 'Crispy Layered Aloo Paratha (6-Pack)',
          nameUrdu: 'آلو پراٹھا پیک',
          price: 480,
          originalPrice: 600,
          type: 'frozen',
          unit: 'pack',
          description: 'Crispy multi-layered parathas stuffed with seasoned potato mash, fresh coriander, and roasted cumin. Sub-zero flash frozen.',
          image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Royal Beef Shami Kebabs (Dozen)',
          nameUrdu: 'شاہی بیف شامی کباب',
          price: 720,
          originalPrice: 850,
          type: 'frozen',
          unit: 'dozen',
          description: 'Prime minced beef slow-cooked with chana dal, whole garam masala, ginger, and garlic. Melts softly upon pan-frying.',
          image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Freshly Fried Halwa Puri Thali',
          nameUrdu: 'حلوہ پوری ناشتہ تھالی',
          price: 350,
          originalPrice: 420,
          type: 'ready_to_eat',
          unit: 'portion',
          description: 'Hot puffed puris served with aromatic suji halwa, sour chana tarkari, and fresh pickled onion salad.',
          image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Homestyle Chicken Karahi (Fresh)',
          nameUrdu: 'گھریلو چکن کڑاہی',
          price: 950,
          originalPrice: 1100,
          type: 'ready_to_eat',
          unit: 'half_kg',
          description: 'Cooked fresh on high flame with farm chicken, ripe tomatoes, ginger juliennes, and freshly crushed black pepper.',
          image: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },
    {
      community: gulshan,
      businessName: "Tahira's Clay Pot Meetha",
      email: 'tahira.sweets@nuray.test',
      chef: 'Tahira Bano',
      avatar: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220002',
      city: 'Karachi',
      area: 'Gulshan-e-Iqbal, Block 7',
      description: 'Slow-simmered artisanal earthen pot desserts, rich saffron kheer, and authentic Hyderabadi shahi tukray.',
      cuisine: ['Zafrani Matka Kheer', 'Shahi Tukray', 'Gajar Ka Halwa', 'Desi Meetha'],
      cover: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=800&q=80&auto=format&fit=crop',
      rating: 4.92,
      reviews: 180,
      prepTime: 15,
      dishes: [
        {
          name: 'Royal Saffron & Pistachio Matka Kheer',
          nameUrdu: 'شاہی زعفرانی مٹکا کھیر',
          price: 420,
          originalPrice: 500,
          type: 'ready_to_eat',
          unit: 'pot',
          description: 'Slow-simmered buffalo milk reduced for 4 hours with fragrant basmati rice, Iranian saffron, and slivered pistachios in an earthen pot.',
          image: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Hyderabadi Shahi Tukray with Rabri',
          nameUrdu: 'حیدرآبادی شاہی ٹکڑے',
          price: 380,
          originalPrice: 450,
          type: 'ready_to_eat',
          unit: 'portion',
          description: 'Crispy fried bread triangles soaked in rich cardamom syrup and drenched in thick, creamy malai rabri.',
          image: 'https://images.unsplash.com/photo-1605478371313-fa6f93afb78c?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },

    // ---------------- DHA Karachi (Phase 5 & 6) ----------------
    {
      community: dhaKarachi,
      businessName: "Naseem's Dum Pukht",
      email: 'naseem.dha@nuray.test',
      chef: 'Chef Naseem Bano',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220003',
      city: 'Karachi',
      area: 'DHA Phase 6, Khayaban-e-Shahbaz',
      description: 'Master of Dum cooking in DHA for over 15 years. Every degh is sealed with whole wheat dough and slow-steamed over coals.',
      cuisine: ['Sindhi Dum Biryani', 'Mutton Yakhni Pulao', 'Zarda', 'Balochi Sajji'],
      cover: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800&q=80&auto=format&fit=crop',
      rating: 4.95,
      reviews: 480,
      prepTime: 25,
      dishes: [
        {
          name: 'Special Zafrani Chicken Dum Biryani',
          nameUrdu: 'زعفرانی چکن دم بریانی',
          price: 850,
          originalPrice: 1000,
          type: 'ready_to_eat',
          unit: 'portion',
          description: 'Extra-long grain aged basmati layered with tender saffron chicken, sour plums, golden baby potatoes, and kewra water.',
          image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Mutton Degi Yakhni Pulao',
          nameUrdu: 'مٹن دیگی یخنی پلاؤ',
          price: 1250,
          originalPrice: 1450,
          type: 'ready_to_eat',
          unit: 'portion',
          description: 'Tender baby goat meat steeped in rich bone broth yakhni, infused with whole fennel, coriander, and caramelized garlic.',
          image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Sub-Zero Marinated Biryani Chicken (Pre-Mix)',
          nameUrdu: 'منجمد بریانی چکن مکس',
          price: 690,
          originalPrice: 800,
          type: 'frozen',
          unit: 'pack',
          description: 'Yogurt, saffron, fried onions, and whole masala marinated chicken sealed at -18°C. Add straight to your rice pot in 10 mins.',
          image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },
    {
      community: dhaKarachi,
      businessName: "Abdul's Charcoal Kitchen",
      email: 'abdul.bbq@nuray.test',
      chef: 'Chef Abdul Wahab',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220004',
      city: 'Karachi',
      area: 'DHA Phase 5, Bukhari Commercial',
      description: 'Live coal grilled kebabs, prime beef bihari boti, and smoked chops seasoned with 18 freshly ground spices.',
      cuisine: ['Bihari Boti', 'Reshmi Seekh Kebab', 'Mutton Chops', 'Charcoal BBQ'],
      cover: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80&auto=format&fit=crop',
      rating: 4.88,
      reviews: 320,
      prepTime: 25,
      dishes: [
        {
          name: 'Melt-in-Mouth Beef Bihari Boti Roll',
          nameUrdu: 'بیف بہاری بوٹی رول',
          price: 380,
          originalPrice: 450,
          type: 'ready_to_eat',
          unit: 'roll',
          description: 'Thin beef ribbons tenderized with green papaya and mustard oil, grilled over live coals, rolled in hot paratha.',
          image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Smoked Chicken Reshmi Seekh Kebab (4 Skewers)',
          nameUrdu: 'ریشمی سیخ کباب',
          price: 620,
          originalPrice: 720,
          type: 'ready_to_eat',
          unit: 'plate',
          description: 'Silky minced chicken skewers infused with fresh cream, ground cashews, and mild aromatic spices.',
          image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },

    // ---------------- Clifton ----------------
    {
      community: clifton,
      businessName: "Fareeha's Frozen Savories",
      email: 'fareeha.frozen@nuray.test',
      chef: 'Fareeha Tariq',
      avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220005',
      city: 'Karachi',
      area: 'Clifton Block 5, Near Boat Basin',
      description: 'Clean room hygienic -18°C frozen appetizers, hand-folded samosas, spring rolls, and chicken patties with zero preservatives.',
      cuisine: ['Cocktail Samosas', 'Spring Rolls', 'Chicken Patties', '-18°C Frozen Snacks'],
      cover: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80&auto=format&fit=crop',
      rating: 4.82,
      reviews: 190,
      prepTime: 10,
      dishes: [
        {
          name: 'Cocktail Beef Keema Samosas (12 Pack)',
          nameUrdu: 'بیف قیمہ سموسے پیک',
          price: 620,
          originalPrice: 750,
          type: 'frozen',
          unit: 'pack',
          description: 'Thin crispy pastry stuffed with hand-minced spiced beef, finely diced scallions, and mint leaves. Flash frozen.',
          image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Chicken & Cheese Spring Rolls (10 Pack)',
          nameUrdu: 'چکن اور پنیر اسپرنگ رولز',
          price: 720,
          originalPrice: 840,
          type: 'frozen',
          unit: 'pack',
          description: 'Crispy golden rolls filled with tender shredded chicken breast, melted mozzarella, and fresh bell peppers.',
          image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },
    {
      community: clifton,
      businessName: "Clifton Healthy Salad Bowls",
      email: 'noor.clifton@nuray.test',
      chef: 'Noor-ul-Huda',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220006',
      city: 'Karachi',
      area: 'Clifton Block 2',
      description: 'Clean eating fresh bowls, herb-marinated chicken breast, quinoa salads, and cold-pressed dressing bottles.',
      cuisine: ['Grilled Salad Boxes', 'Quinoa Bowls', 'Mediterranean Wraps'],
      cover: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80&auto=format&fit=crop',
      rating: 4.85,
      reviews: 140,
      prepTime: 15,
      dishes: [
        {
          name: 'Grilled Herb Chicken Mediterranean Salad Box',
          nameUrdu: 'میڈیٹیرینین چکن سلاد باکس',
          price: 680,
          originalPrice: 790,
          type: 'ready_to_eat',
          unit: 'box',
          description: 'Juicy olive oil grilled chicken slices over crisp romaine, Kalamata olives, cherry tomatoes, and feta dressing.',
          image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },

    // ---------------- PECHS ----------------
    {
      community: pechs,
      businessName: "Phupo Asma's Heritage Pot",
      email: 'asma.pechs@nuray.test',
      chef: 'Asma Begum',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220007',
      city: 'Karachi',
      area: 'PECHS Block 2, Near Tariq Road',
      description: 'Famous for the traditional 12-hour braised beef shank nihari and kunna gosht, slow-cooked in thick clay pots in PECHS.',
      cuisine: ['12h Slow-Cooked Nihari', 'Kunna Gosht', 'Maghaz Masala', 'Roghni Kulcha'],
      cover: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80&auto=format&fit=crop',
      rating: 4.96,
      reviews: 310,
      prepTime: 30,
      dishes: [
        {
          name: 'Royal Shahi Beef Nihari (12h Braise)',
          nameUrdu: 'شاہی بیف نہاری',
          price: 1100,
          originalPrice: 1350,
          type: 'ready_to_eat',
          unit: 'portion',
          description: 'Bong shank cuts slow-braised overnight in rich aromatic flour-thickened gravy. Served with fried ginger, green chillies, and fresh lemon.',
          image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Chinioti Kunna Gosht (Clay Pot)',
          nameUrdu: 'چنیوٹی کُنہ گوشت',
          price: 1400,
          originalPrice: 1650,
          type: 'ready_to_eat',
          unit: 'portion',
          description: 'Tender mutton cooked in an unglazed clay handi with pure desi ghee and roasted cumin. Melts at first touch.',
          image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },
    {
      community: pechs,
      businessName: "Ammi's Kitchenette (Tariq Road)",
      email: 'farida.pechs@nuray.test',
      chef: 'Farida Parveen',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220008',
      city: 'Karachi',
      area: 'PECHS Block 6',
      description: 'Daily fresh comfort food: yellow dal tadka, zeera rice, homestyle aloo gosht, and seasonal sabzi.',
      cuisine: ['Dal Chawal Thali', 'Aloo Gosht', 'Bhindi Masala', 'Homestyle Sabzi'],
      cover: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80&auto=format&fit=crop',
      rating: 4.88,
      reviews: 210,
      prepTime: 20,
      dishes: [
        {
          name: 'Yellow Moong Dal with Zeera Rice & Pickle',
          nameUrdu: 'دال چاول تھالی',
          price: 450,
          originalPrice: 520,
          type: 'ready_to_eat',
          unit: 'thali',
          description: 'Comforting yellow lentils tempered with cumin, garlic, and red chilies, paired with fragrant basmati and mango pickle.',
          image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },

    // ---------------- North Nazimabad ----------------
    {
      community: northNazimabad,
      businessName: "Rabia's Morning Tiffin & Parathas",
      email: 'rabia.nazimabad@nuray.test',
      chef: 'Rabia Begum',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220009',
      city: 'Karachi',
      area: 'North Nazimabad, Block H',
      description: 'Crispy desi ghee layered parathas, authentic Karachi anda ghotala, and morning breakfast boxes delivered hot.',
      cuisine: ['Desi Ghee Parathas', 'Anda Ghotala', 'Halwa Puri', 'Chai Nashta'],
      cover: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop',
      rating: 4.83,
      reviews: 175,
      prepTime: 15,
      dishes: [
        {
          name: 'Crispy Desi Ghee Lachha Paratha (Pack of 5)',
          nameUrdu: 'لچھا پراٹھا پیک',
          price: 450,
          originalPrice: 550,
          type: 'frozen',
          unit: 'pack',
          description: 'Flaky layered whole wheat parathas kneaded with pure cow ghee. Frozen fresh with separating sheets.',
          image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600&q=80&auto=format&fit=crop',
        },
        {
          name: 'Special Karachi Anda Ghotala with 2 Parathas',
          nameUrdu: 'انڈا گھوٹالہ ناشتہ',
          price: 320,
          originalPrice: 380,
          type: 'ready_to_eat',
          unit: 'portion',
          description: 'Scrambled eggs cooked in a spicy onion-tomato masala with green chilies, coriander, and two hot crispy parathas.',
          image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },

    // ---------------- Askari 4 & Malir Cantt ----------------
    {
      community: askari4,
      businessName: "Baji Rukhsana's Dawat Pot",
      email: 'rukhsana.askari4@nuray.test',
      chef: 'Baji Rukhsana Begum',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220010',
      city: 'Karachi',
      area: 'Askari 4, Rashid Minhas Road',
      description: 'Grand festive Dawat-style cooking: velvet shahi kofta curry with eggs, slow-cooked mutton korma, and saffron zarda.',
      cuisine: ['Shahi Kofta Curry', 'Degi Mutton Korma', 'Zarda', 'Dawat Dishes'],
      cover: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800&q=80&auto=format&fit=crop',
      rating: 4.89,
      reviews: 198,
      prepTime: 25,
      dishes: [
        {
          name: 'Shahi Beef Kofta Curry with Boiled Eggs',
          nameUrdu: 'شاہی بیف کوفتہ کری',
          price: 750,
          originalPrice: 890,
          type: 'ready_to_eat',
          unit: 'portion',
          description: 'Spiced minced beef meatballs simmered in a velvety yogurt, fried onion, and poppy seed korma gravy.',
          image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },

    // ---------------- Bahria Town Karachi ----------------
    {
      community: bahriaTown,
      businessName: 'Bahria Spice Artisans',
      email: 'zainab.bahria@nuray.test',
      chef: 'Zainab & Family',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&q=80&auto=format&fit=crop',
      phone: '+923002220011',
      city: 'Karachi',
      area: 'Bahria Town Karachi, Precinct 1',
      description: 'Pure desi chicken karahi in butter, organic saag with makki roti, and clay oven baked tandoori naans.',
      cuisine: ['Desi Murgh Karahi', 'Makki Roti', 'Sarson Ka Saag', 'Tandoor Breads'],
      cover: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=800&q=80&auto=format&fit=crop',
      rating: 4.91,
      reviews: 165,
      prepTime: 30,
      dishes: [
        {
          name: 'Desi Chicken Karahi in Pure Butter (Half kg)',
          nameUrdu: 'دیسی مکھن چکن کڑاہی',
          price: 1400,
          originalPrice: 1650,
          type: 'ready_to_eat',
          unit: 'half_kg',
          description: 'Free-range chicken cooked in cast-iron kadai with rich cultured butter, fresh tomatoes, and slivered ginger.',
          image: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&q=80&auto=format&fit=crop',
        },
      ],
    },
  ];

  // Also support Lahore communities if present
  if (askari11 && askari10 && dha6 && dha5) {
    allKitchenDefinitions.push(
      {
        community: askari11,
        businessName: "Askari 11 Dum Biryani & Pulao",
        email: 'biryani.askari11@nuray.test',
        chef: 'Chef Farhan Qureshi',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&q=80&auto=format&fit=crop',
        phone: '+923003330001',
        city: 'Lahore',
        area: 'Askari 11, Sector B',
        description: 'Long-grain fragrant dum biryani and yakhni pulao cooked in traditional deg in Askari 11.',
        cuisine: ['Dum Biryani', 'Yakhni Pulao', 'Kachumber'],
        cover: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800&q=80&auto=format&fit=crop',
        rating: 4.88,
        reviews: 210,
        prepTime: 20,
        dishes: [
          {
            name: 'Special Zafrani Chicken Dum Biryani (Lahori)',
            nameUrdu: 'زعفرانی دم بریانی',
            price: 650,
            originalPrice: 750,
            type: 'ready_to_eat',
            unit: 'portion',
            description: 'Aged basmati rice infused with whole spices and tender chicken.',
            image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600&q=80&auto=format&fit=crop',
          },
        ],
      },
      {
        community: dha5,
        businessName: "DHA Phase 5 Artisanal Oven",
        email: 'artisanal.dha5@nuray.test',
        chef: 'Chef Hamza Tariq',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&q=80&auto=format&fit=crop',
        phone: '+923003330002',
        city: 'Lahore',
        area: 'DHA Phase 5, Sector C',
        description: 'Fresh wood-fired oven pizzas, gourmet smash burgers, and garlic butter focaccia.',
        cuisine: ['Smash Burgers', 'Artisan Pizza', 'Focaccia'],
        cover: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80&auto=format&fit=crop',
        rating: 4.93,
        reviews: 310,
        prepTime: 25,
        dishes: [
          {
            name: 'Double Patty Truffle Smash Burger',
            nameUrdu: 'ٹرفل سمیش برگر',
            price: 850,
            originalPrice: 990,
            type: 'ready_to_eat',
            unit: 'portion',
            description: 'Two smashed prime beef patties with caramelized onions and truffle aioli on a brioche bun.',
            image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80&auto=format&fit=crop',
          },
        ],
      }
    );
  }

  // Upsert all defined kitchens
  for (const k of allKitchenDefinitions) {
    const user = await getOrCreateUser(k.email, k.chef, k.phone, k.avatar, k.city, k.area);

    let seller = await prisma.seller.findUnique({ where: { userId: user.id } });

    if (!seller) {
      seller = await prisma.seller.create({
        data: {
          userId: user.id,
          businessName: k.businessName,
          description: k.description,
          coverImageUrl: k.cover,
          ratingAverage: k.rating,
          totalReviews: k.reviews,
          isVerified: true,
          verificationStatus: 'approved',
          status: 'active',
          communityId: k.community.id,
          primaryCommunityName: k.community.name,
          allowCrossCommunity: true,
          minPrepTimeMinutes: k.prepTime,
          freeDeliveryAreas: [k.community.name],
          latitude: k.community.centerLatitude,
          longitude: k.community.centerLongitude,
          mealCategories: k.cuisine,
        },
      });
    } else {
      seller = await prisma.seller.update({
        where: { id: seller.id },
        data: {
          businessName: k.businessName,
          description: k.description,
          coverImageUrl: k.cover,
          ratingAverage: k.rating,
          totalReviews: k.reviews,
          isVerified: true,
          verificationStatus: 'approved',
          status: 'active',
          communityId: k.community.id,
          primaryCommunityName: k.community.name,
          allowCrossCommunity: true,
          minPrepTimeMinutes: k.prepTime,
          mealCategories: k.cuisine,
        },
      });
    }

    // Upsert dishes and product images
    for (const dish of k.dishes) {
      let product = await prisma.product.findFirst({
        where: { sellerId: seller.id, name: dish.name },
      });

      if (!product) {
        product = await prisma.product.create({
          data: {
            sellerId: seller.id,
            name: dish.name,
            nameUrdu: dish.nameUrdu,
            slug: dish.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 100000),
            price: dish.price,
            originalPrice: dish.originalPrice,
            productType: dish.type,
            unit: dish.unit,
            isActive: true,
            approvalStatus: 'approved',
            description: dish.description,
            stockQuantity: 50,
            stockType: dish.type === 'frozen' ? 'hub' : 'direct',
            preparationTime: k.prepTime,
          },
        });
      } else {
        product = await prisma.product.update({
          where: { id: product.id },
          data: {
            price: dish.price,
            originalPrice: dish.originalPrice,
            description: dish.description,
            isActive: true,
            approvalStatus: 'approved',
            stockQuantity: 50,
          },
        });
      }

      // Ensure ProductImage exists
      const existingImage = await prisma.productImage.findFirst({
        where: { productId: product.id },
      });

      if (!existingImage && dish.image) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            imageUrl: dish.image,
            isPrimary: true,
            sortOrder: 0,
          },
        });
      }
    }
  }

  console.log(`✅ Successfully seeded ${allKitchenDefinitions.length} authentic community kitchens with real products & images!`);
}

if (require.main === module) {
  seedCommunityKitchens()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      prisma.$disconnect();
      process.exit(1);
    });
}
