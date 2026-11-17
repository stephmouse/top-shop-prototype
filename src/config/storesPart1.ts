import type { RawStoreSpec } from './stores';

export const STORES_PART_1: readonly RawStoreSpec[] = [
  {
    id: 'aesthetics_julia', name: 'Aesthetics Julia', segmentPool: 'service', baseOpenCost: 672,
    items: [
      ['Massage', 56], ['Arms', 112], ['Legs', 224],
      ['Abdominal', 392], ['Facial', 616], ['Full Body', 896],
    ],
  },
  {
    id: 'animal_world', name: 'Animal World', segmentPool: 'retail', baseOpenCost: 672,
    items: [
      ['Turtle', 56], ['Tropical Fish', 112], ['Ferret', 224],
      ['Alligator', 392], ['Kitten', 616], ['Puppy', 896],
    ],
  },
  {
    id: 'arcade_games', name: 'Arcade Games', segmentPool: 'leisure', baseOpenCost: 624,
    items: [
      ['Fighting Game', 52], ['Puzzle Game', 104],
      ['Crane Game', 208], // VERIFY: Dreen FAQ says 108; 52*4 pattern = 208
      ['Shooting Game', 364], ['Basketball Game', 572], ['Racing Game', 832],
    ],
  },
  {
    id: 'auto_parts', name: 'Auto Parts', segmentPool: 'retail', baseOpenCost: 768,
    items: [
      ['Wax', 64], ['Chains', 128], ['Snow Tires', 256],
      ['CD Changer', 448], ['Fog Lights', 704], ['Security System', 1024],
    ],
  },
  {
    id: 'bakery', name: 'Bakery', segmentPool: 'food', baseOpenCost: 240,
    items: [
      ['Bun', 20], ['Cheese Bread', 40], ['Bread', 80],
      ['Pizza Bread', 140], ['Sandwich', 220], ['French Bread', 320],
    ],
  },
  {
    id: 'bbq_house', name: 'BBQ House', segmentPool: 'food', baseOpenCost: 624,
    items: [
      ['Mash Potato', 52], ['Clam Chowder', 104], ['BBQ Chicken', 208],
      ['BBQ Pork', 364], ['New York Steak', 572], ['Fillet Steak', 832],
    ],
  },
  {
    id: 'bobsons', name: 'Bobsons', segmentPool: 'food', baseOpenCost: 288,
    items: [
      ['Vanilla', 24], ['Strawberry', 48], ['Chocolate', 96],
      ['Cookie & Cream', 168], ['Rum Raisin', 264], ['Mix Fruits', 384],
    ],
  },
  {
    id: 'burger_shop', name: 'Burger Shop', segmentPool: 'food', baseOpenCost: 384,
    items: [
      ['Fries', 32], ['Nuggets', 64], ['Fried Chicken', 128],
      ['Teriyaki Burger', 224], ['King Combo', 352], ['DX Combo', 512],
    ],
  },
  {
    id: 'camera_shop', name: 'Camera Shop', segmentPool: 'retail', baseOpenCost: 432,
    items: [
      ['Film', 36], ['Album', 72], ['Developing', 144],
      ['Camera', 252], ['APS Camera', 396], ['Digital Camera', 576],
    ],
  },
  {
    id: 'candy_store', name: 'Candy Store', segmentPool: 'food', baseOpenCost: 288, // Manual p.25
    items: [
      ['Orange Candy', 24], ['Apple Gum', 48], ['Snack', 96],
      ['Yoyo', 168], ['DX Candy Set', 264], ['DX Snack Set', 384],
    ],
  },
  {
    id: 'comic_boy', name: 'Comic Boy', segmentPool: 'retail', baseOpenCost: 432,
    items: [
      ['Weekly Magazine', 36], ['Japanese Comic', 72], ['Z Man', 144],
      ['Game Hint Book', 252], ['Super Z Man', 396], ['Z Man Calendar', 576],
    ],
  },
  {
    id: 'cookin_fun', name: "Cookin' Fun", segmentPool: 'retail', baseOpenCost: 288,
    items: [
      ['Glass', 24], ['Bowl', 48], ['Spoon', 96],
      ['Plate', 168], ['Frying Pan', 264], ['DX Plate Set', 384],
    ],
  },
  {
    id: 'corner_deli_cafe', name: 'Corner deli Cafe', segmentPool: 'food', baseOpenCost: 336,
    items: [
      ['Tuna Sandwich', 28], ['Caesar Salad', 56], ['B.L.T', 112],
      ['Chicken Sandwich', 196], ['Roast Beef', 308], ['Cheese Steak', 448],
    ],
  },
  {
    id: 'curry_india', name: 'Curry India', segmentPool: 'food', baseOpenCost: 432, // Manual p.23
    items: [
      ['Veggie Curry', 36], ['Pork Curry', 72], ['Chicken Curry', 144],
      ['Spicy Curry', 252], ['Shrimp Curry', 396], ['Beef Curry', 576],
    ],
  },
  {
    id: 'electrical_goods', name: 'Electrical Goods', segmentPool: 'retail', baseOpenCost: 672,
    items: [
      ['Boom Box', 56], ['TV', 112], ['VCR', 224],
      ['DVD Player', 392], ['Air Conditioner', 616],
      ['Refrigerator', 896], // VERIFY: Dreen FAQ says 856; 56*16 pattern = 896
    ],
  },
  {
    id: 'fancy_dress', name: 'Fancy Dress', segmentPool: 'retail', baseOpenCost: 576,
    items: [
      ['Mini T-Shirt', 48], ['Tank Top', 96], ['T-Shirt', 192],
      ['Cardigan', 336], ['Skirt', 528], ['One-piece Dress', 768],
    ],
  },
  {
    id: 'fish_market', name: 'Fish Market', segmentPool: 'food', baseOpenCost: 480,
    items: [
      ['Scallop', 40], ['Tuna', 80], ['Shrimp', 160],
      ['Salmon', 280], ['Oyster', 440], ['Lobster', 640],
    ],
  },
  {
    id: 'fishing_gear', name: 'Fishing Gear', segmentPool: 'retail', baseOpenCost: 720,
    items: [
      ['Lure', 60], ['Electric Rod', 120], ['Carbon Rod', 240],
      ['DX Fishing Set', 420], ['Fish Radar', 660], ['Bass Fish Boat', 960],
    ],
  },
  {
    id: 'flower_heart', name: 'Flower Heart', segmentPool: 'retail', baseOpenCost: 240,
    items: [
      ["Baby's-Breath", 20], ['Iris', 40], ['Tulip', 80],
      ['Carnation', 140], ['Lily', 220], ['Rose', 320],
    ],
  },
  {
    id: 'fresh_estate', name: 'Fresh Estate', segmentPool: 'service', baseOpenCost: 672,
    items: [
      ['Room for Rent', 56], ['Apartment', 112], ['Condo', 224],
      ['Office', 392], ['Luxurious Condo', 616], ['House', 896],
    ],
  },
  {
    id: 'fruits_market', name: 'Fruits Market', segmentPool: 'food', baseOpenCost: 384, // Manual p.23
    items: [
      ['Bananas', 32], ['Oranges', 64], ['Apples', 128],
      ['Pears', 224], ['Cherries', 352], ['Watermelon', 512],
    ],
  },
  {
    id: 'fun_toys', name: 'Fun Toys', segmentPool: 'retail', baseOpenCost: 576,
    items: [
      ['Cards', 48], ['Plastic Model', 96], ['Stuffed Animal', 192],
      ['Board Game', 336], ['RC Car', 528], ['RC Robot', 768],
    ],
  },
];