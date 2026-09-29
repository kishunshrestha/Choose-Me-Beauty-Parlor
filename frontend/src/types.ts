export type Kind = 'services' | 'courses' | 'gallery' | 'tiktok' | 'testimonials';
export type Content = {
  id: string; title: string; visible: boolean; order: number; updatedAt?: string;
  description?: string; category?: string; price?: string; duration?: string;
  image?: string; icon?: string; alt?: string; url?: string; quote?: string; service?: string; rating?: number;
};
export type Settings = {
  name: string; owner: string; phone: string; internationalPhone: string; address: string;
  heroTitle: string; heroDescription: string; heroImage: string; featureImage: string; ownerImage: string;
  about: string; whatsappEnabled: boolean; instagram: string; facebook: string; tiktok: string; mapsUrl: string;
};
export type SiteData = {settings: Settings} & Record<Kind, Content[]>;
export type Enquiry = {id: string; name: string; phone: string; subject: string; preferred_date: string; message: string; status: string; created_at: string};
export type Session = {email: string; csrf: string};
