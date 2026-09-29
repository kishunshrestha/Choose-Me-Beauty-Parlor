export const defaultSettings = {
  name: 'Choose Me Makeup Studio & Academy', owner: 'Ritima Silwal',
  phone: '9804902596', internationalPhone: '+9779804902596',
  address: 'Dhulabari, near Nanda Petrol Pump, Nepal',
  heroTitle: 'Beauty, styled your way.',
  heroDescription: 'A little care. A little confidence. A look that feels completely you. Discover makeup, hair, nails and beauty training in Dhulabari.',
  heroImage: '/images/hero.webp', featureImage: '/images/still-life.webp', ownerImage: '',
  about: 'Choose Me Makeup Studio & Academy is owned and operated by Ritima Silwal in Dhulabari. The studio provides professional beauty services along with practical beauty and makeup training for beginners and aspiring beauty professionals.',
  whatsappEnabled: false, instagram: '', facebook: '', tiktok: '', mapsUrl: '',
};
const service = (title, category, description, icon, order) => ({title, category, description, icon, price: '', duration: '', image: '', visible: true, order});
export const seeds = {
  services: [
    service('Bridal Makeup', 'Makeup', 'Thoughtfully crafted makeup for your most meaningful day. Beautiful in person, timeless in photographs.', 'sparkles', 1),
    service('Hair Cutting & Styling', 'Hair', 'A fresh shape, a soft finish, a style that feels like you. Let’s find your next favourite look.', 'scissors', 2),
    service('Nail Art', 'Nails', 'From understated details to a little statement. Beautifully finished nails, your way.', 'flower', 3),
    service('Facial', 'Skin', 'Take a moment for yourself with a refreshing facial and a little extra care for your skin.', 'leaf', 4),
    service('Party Makeup', 'Makeup', 'Soft and glowing or a little more expressive. Makeup made for your occasion.', 'brush', 5),
    service('Hair Coloring & Treatments', 'Hair', 'Explore a new colour or give your hair some attention with a personalised consultation.', 'scissors', 6),
    service('Manicure & Pedicure', 'Nails', 'A thoughtful finishing touch for your hands and feet.', 'flower', 7),
    service('Eyebrow Threading', 'Skin', 'Careful shaping to softly frame your face.', 'sparkles', 8),
    service('Waxing', 'Skin', 'Professional grooming with attention to your comfort.', 'leaf', 9),
    service('Cleanup', 'Skin', 'A simple skin refresh to leave you feeling cared for.', 'leaf', 10),
    service('Skincare', 'Skin', 'Personal care and guidance for your skin’s needs.', 'leaf', 11),
    service('Mehendi Designs', 'Mehendi', 'Delicate details and expressive patterns for your celebrations.', 'flower', 12),
  ],
  courses: [
    ['Beauty Training for Beginners', 'Start with the foundations. Build confidence through practical beauty skills.'],
    ['Advanced Makeup Course', 'Develop your technique, explore new looks and refine your artistry.'],
    ['Hair Styling Course', 'Learn to shape, style and create occasion-ready hair.'],
    ['Nail Art Course', 'Explore preparation, finishing and creative nail designs.'],
    ['Social Media / Instagram Makeup Training', 'Create expressive makeup looks for the camera and your creative portfolio.'],
  ].map(([title, description], i) => ({title, description, duration: '', visible: true, order: i})),
  gallery: [], tiktok: [], testimonials: [],
};
