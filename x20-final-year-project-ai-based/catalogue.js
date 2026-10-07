(function attachCartwiseCatalogue(root, createCatalogue) {
  const catalogue = createCatalogue();
  if (typeof module === 'object' && module.exports) module.exports = catalogue;
  if (root) root.CARTWISE_PRODUCTS = catalogue;
})(typeof globalThis === 'undefined' ? this : globalThis, function createCatalogue() {
  return [
    {id:1,name:'Organic avocados',category:'Fresh',detail:'2 pack · Ripe & ready',price:3.49,emoji:'🥑',color:'#e8eee0',badge:'POPULAR'},
    {id:2,name:'Sourdough loaf',category:'Bakery',detail:'Freshly baked · 450g',price:4.25,emoji:'🍞',color:'#f1e9dc',badge:'BAKED TODAY'},
    {id:3,name:'Oat milk',category:'Dairy',detail:'Barista blend · 1L',price:3.15,emoji:'🥛',color:'#ece9df',badge:''},
    {id:4,name:'Strawberries',category:'Fresh',detail:'Sweet & juicy · 250g',price:4.80,emoji:'🍓',color:'#f2e4df',badge:'IN SEASON'},
    {id:5,name:'Free-range eggs',category:'Dairy',detail:'Happy hens · 6 pack',price:4.10,emoji:'🥚',color:'#f1eddf',badge:''},
    {id:6,name:'Rigatoni pasta',category:'Pantry',detail:'Stone milled · 500g',price:2.60,emoji:'🍝',color:'#efe6d6',badge:'PANTRY PICK'},
    {id:7,name:'Sparkling water',category:'Drinks',detail:'Lime & mint · 4 pack',price:5.25,emoji:'🧃',color:'#e3eee9',badge:''},
    {id:8,name:'Baby spinach',category:'Fresh',detail:'Washed & ready · 120g',price:2.95,emoji:'🥬',color:'#e5eddf',badge:'FRESH PICK'}
  ];
});
