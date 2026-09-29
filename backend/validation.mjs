import { z } from 'zod';
const text = (max = 200) => z.string().trim().max(max);
const required = (max = 200) => text(max).min(1, 'This field is required.');
const image = text(2000).refine(value => !value || /^\/(?:images|uploads)\/[a-zA-Z0-9_.-]+$/.test(value) || /^https:\/\/[^\s]+$/.test(value), 'Use an uploaded image or a valid HTTPS image URL.');
const url = text(2000).refine(value => !value || /^https:\/\/[^\s]+$/.test(value), 'Use an HTTPS URL.');
const shared = {title: required(160), visible: z.boolean(), order: z.number().int().min(0).max(9999)};
export const schemas = {
  services: z.object({...shared, category: z.enum(['Makeup','Hair','Nails','Skin','Mehendi']), description: required(1200), price: text(100), duration: text(100), image, icon: z.enum(['sparkles','scissors','flower','leaf','brush'])}),
  courses: z.object({...shared, description: required(1500), duration: text(100)}),
  gallery: z.object({...shared, image: image.refine(Boolean, 'Add a photo.'), category: z.enum(['Bridal','Makeup','Hair','Nails','Mehendi','Skin']), alt: required(250)}),
  tiktok: z.object({...shared, url: required(2000).refine(value => /^https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+(?:[?#].*)?$/.test(value), 'Paste the full TikTok URL: https://www.tiktok.com/@name/video/123…')}),
  testimonials: z.object({...shared, quote: required(1500), service: text(160), rating: z.number().int().min(1).max(5)}),
};
export const settingsSchema = z.object({
  name: required(), owner: required(), phone: required(30), internationalPhone: z.string().regex(/^\+[1-9]\d{6,14}$/), address: required(400),
  heroTitle: required(160), heroDescription: required(700), heroImage: image, featureImage: image, ownerImage: image,
  about: required(2500), whatsappEnabled: z.boolean(), instagram: url, facebook: url, tiktok: url, mapsUrl: url,
});
export const enquirySchema = z.object({
  name: required(100), phone: z.string().trim().regex(/^\+?[\d\s()-]{7,25}$/, 'Enter a valid phone number.').refine(value => value.replace(/\D/g,'').length >= 7, 'Enter a valid phone number.'),
  serviceId: text(100).optional(), courseId: text(100).optional(),
  preferredDate: z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value && value >= new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kathmandu'})), 'Choose today or a future date.'),
  message: text(2000), website: text(200).optional(),
}).refine(data => !(data.serviceId && data.courseId), 'Choose a service or a course.');
