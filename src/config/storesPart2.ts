import type { RawStoreSpec } from './stores';

export const STORES_PART_2: readonly RawStoreSpec[] = [
  {
    id: 'golden_jewelry', name: 'Golden Jewelry', segmentPool: 'retail', baseOpenCost: 720,
    items: [
      ['Pearl', 60], ['18K Gold', 120], ['Emerald', 240],
      ['Ruby', 420], ['Platinum', 660], ['Diamond', 960],
    ],
  },
  {
    id: 'gameland', name: 'Gameland', segmentPool: 'leisure', baseOpenCost: 384,
    items: [
      ['Go-Carts', 32], ['Carousel', 64], ['Haunted House', 128],
      ['Ferris Wheel', 224], ['Loop Coaster', 352], ['Tower Hall', 512],
    ],
  },
  {
    id: 'george_video', name: 'George Video', segmentPool: 'leisure', baseOpenCost: 528, // Manual p.23
    items: [
      ['Pop Corn', 44], ['Video Game', 88], ['Old Movie', 176],
      ['New Release', 308], ['VCR', 484], ['DVD Player', 704],
    ],
  },
  {
    id: 'home_needs', name: 'Home Needs', segmentPool: 'retail', baseOpenCost: 528,
    items: [
      ['Nails', 44], ['Hammer', 88], ['Screw Driver', 176],
      ['Veneer Board', 308], ['Paint', 484], ['Ladder', 704],
    ],
  },
  {
    id: 'italian', name: 'Italian', segmentPool: 'food', baseOpenCost: 480,
    items: [
      ['Spaghetti', 40], ['Seafood Marinade', 80], ['Lasagna', 160],
      ['Ham & Egg Pizza', 280], ['Beef Sautee', 440], ['Pizza', 640],
    ],
  },
  {
    id: 'johnson_books', name: 'Johnson Books', segmentPool: 'retail', baseOpenCost: 336,
    items: [
      ['Magazine', 28], ['Novel', 56], ['Coloring Book', 112],
      ['Reference Book', 196], ['History Album', 308], ['Encyclopedia', 448],
    ],
  },
  {
    id: 'juice_pub', name: 'Juice Pub', segmentPool: 'food', baseOpenCost: 528,
    items: [
      ['Orange Blast', 44], ['Citrus Surprise', 88], ['Banana Burst', 176],
      ['Kiwi Delight', 308], ['Strawberry Slam', 484], ['Hawaiian Explosion', 704],
    ],
  },
  {
    id: 'kid', name: 'KID', segmentPool: 'retail', baseOpenCost: 720,
    items: [
      ['Dragon War', 60], ['Space Shot', 120], ['Star Sweep', 240],
      ['Puzzle Boy', 420], ['Racing Champ', 660], ["Who's Rich?", 960],
    ],
  },
  {
    id: 'kiss', name: 'Kiss', segmentPool: 'food', baseOpenCost: 192,
    items: [
      ['Chocolate Shake', 16], ['Apple Pie', 32], ['Chicken Wings', 64],
      ['Grilled Chicken', 112], ['T-Bone Steak', 176], ['Steak & Shrimp', 256],
    ],
  },
  {
    id: 'meat_land', name: 'Meat Land', segmentPool: 'food', baseOpenCost: 384,
    items: [
      ['Ground Meat', 32], ['Sausage', 64], ['Bacon', 128],
      ['Chicken', 224], ['Pork', 352], ['Beef', 512],
    ],
  },
  {
    id: 'mens_clothes', name: "Men's Clothes", segmentPool: 'retail', baseOpenCost: 576,
    items: [
      ['Socks', 48], ['Dress Shirt', 96], ['Belt', 192],
      ['Tie', 336], ['Sweater', 528], ['Business Suit', 768],
    ],
  },
  {
    id: 'movie_theater', name: 'Movie Theater', segmentPool: 'leisure', baseOpenCost: 768,
    items: [
      ["Witch's Shopping", 64], ['Deep Sleep', 128], ['Princess Amy', 256],
      ['Z man 3', 448], ['Last World', 704], ['Moon Wars', 1024],
    ],
  },
  {
    id: 'noodle_house', name: 'Noodle House', segmentPool: 'food', baseOpenCost: 528,
    items: [
      ['Veggie Noodle', 44], ['Chicken Noodle', 88], ['Pork Noodle', 176],
      ['Beef Noodle', 308], ['Combo Noodle', 484], ['Lobster Noodle', 704],
    ],
  },
  {
    id: 'office_needs', name: 'Office Needs', segmentPool: 'retail', baseOpenCost: 336,
    items: [
      ['Pencil', 28], ['Eraser', 56], ['Notebook', 112],
      ['Ballpoint Pen', 196], ['Stapler', 308], ['Fountain Pen', 448],
    ],
  },
  {
    id: 'pancake_house', name: 'Pancake House', segmentPool: 'food', baseOpenCost: 480, // Manual p.25
    items: [
      ['Coffee', 40], ['Cream Soda', 80], ['Pancake', 160],
      ['Omelet', 280], ['Pancake and Eggs', 440], ['Pancake and Combo', 640],
    ],
  },
  {
    id: 'pharmacy', name: 'Pharmacy', segmentPool: 'retail', baseOpenCost: 336,
    items: [
      ['Toothbrush', 28], ['Tissue', 56], ['Shampoo', 112],
      ['Hair Mousse', 196], ['Cold Medicine', 308], ['Diet Food', 448],
    ],
  },
  {
    id: 'saving_groceries', name: 'Saving Groceries', segmentPool: 'food', baseOpenCost: 576,
    items: [
      ['Potato', 48], ['Onions', 96], ['Carrots', 192],
      ['Mushrooms', 336], ['Cabbage', 528], ['Organic Veggies', 768],
    ],
  },
  {
    id: 'sports_shop', name: 'Sports Shop', segmentPool: 'retail', baseOpenCost: 624,
    items: [
      ['Ping Pong Ball', 52], ['Tennis Ball', 104], ['Baseball Bat', 208],
      ['Soccer Shoes', 364], ['Baseball Glove', 572], ['Golf Club Set', 832],
    ],
  },
  {
    id: 'star_coffee', name: 'Star Coffee', segmentPool: 'food', baseOpenCost: 432,
    items: [
      ['Coffee', 36], ['Hot Chocolate', 72], ['Lemonade', 144],
      ['Mocha', 252], ['Espresso', 396], ['Cappuccino', 576],
    ],
  },
  {
    id: 'tokyo_restaurant', name: 'Tokyo Restaurant', segmentPool: 'food', baseOpenCost: 480, // Manual p.23
    items: [
      ['Green Tea', 40], ['Teriyaki Chicken', 80], ['Teriyaki Beef', 160],
      ['Sushi Set', 280], ['Tempura Set', 440], ['DX Sushi Set', 640],
    ],
  },
  {
    id: 'tour_tours', name: 'Tour Tours', segmentPool: 'service', baseOpenCost: 816,
    items: [
      ['Hot Springs Tour', 68], ['Las Vegas Tour', 136], ['Miami Resort', 272],
      ['Hawaii 6 Days', 476], ['8-Day Europe', 748], ['World Tour', 1088],
    ],
  },
  {
    id: 'yamato_music', name: 'Yamato Music', segmentPool: 'retail', baseOpenCost: 624,
    items: [
      ['Castanets', 52], ['Triangle', 104], ['Guitar', 208],
      ['Drum Set', 364], ['Violin', 572], ['Piano', 832],
    ],
  },
];