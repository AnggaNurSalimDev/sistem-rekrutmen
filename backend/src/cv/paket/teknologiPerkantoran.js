/**
 * Paket untuk lowongan IT, perkantoran, analitik, dan desain.
 *
 * Alias umum teknologi ("ReactJS" → React, "JS" → JavaScript) sudah
 * ditangani kamus alias scoring engine, jadi tidak perlu ditulis di sini.
 *
 * Sengaja tidak memuat kata yang juga kata sehari-hari (misalnya "Word"
 * tanpa "Microsoft", atau ".NET" yang sama dengan kata "net"), karena regex
 * tidak bisa membedakan konteks. Skill seperti itu tetap bisa dicari jika
 * HR menuliskannya di skill lowongan.
 */
const NAMA = [
  // Web & mobile
  'HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'React Native', 'Vue', 'Angular', 'Next.js', 'Nuxt',
  'Node.js', 'Express', 'Tailwind CSS', 'Bootstrap', 'Sass', 'jQuery', 'Redux', 'Vite', 'Webpack',
  'PHP', 'Laravel', 'CodeIgniter', 'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring Boot', 'Kotlin',
  'Swift', 'Flutter', 'Dart', 'Go', 'C', 'C++', 'C#', 'Ruby', 'Ruby on Rails', 'Rust',
  'REST API', 'GraphQL',
  // Data & infrastruktur
  'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle', 'Firebase', 'Supabase',
  'Git', 'GitHub', 'GitLab', 'Docker', 'Kubernetes', 'Linux', 'Nginx', 'AWS', 'GCP', 'Azure', 'CI/CD',
  'Jest', 'Cypress', 'Selenium', 'Postman',
  // Analitik
  'Excel', 'Google Sheets', 'Power BI', 'Tableau', 'Looker Studio', 'Pandas', 'NumPy', 'Machine Learning',
  // Desain
  'Figma', 'Adobe XD', 'Photoshop', 'Illustrator', 'CorelDRAW', 'Canva', 'Premiere Pro', 'After Effects',
  'UI/UX',
  // Perkantoran & bisnis
  'Microsoft Office', 'Microsoft Word', 'PowerPoint', 'SAP', 'Accurate', 'Akuntansi', 'Perpajakan',
  'Digital Marketing', 'SEO', 'Copywriting', 'Social Media Marketing', 'Customer Service', 'Public Speaking',
  'Negosiasi', 'Jira', 'Trello', 'Scrum', 'Agile',
];

export default {
  id: 'teknologi-perkantoran',
  nama: 'Teknologi & Perkantoran',
  deskripsi: 'Pemrograman, data, desain, dan aplikasi perkantoran.',
  skill: NAMA.map((nama) => ({ nama })),
};
