import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────────────────────

const ExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  startDate: z.string(),
  endDate: z.string(), // "Present" for current roles
  bullets: z.array(z.string()).min(3).max(10),
});

const ProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  technologies: z.array(z.string()),
  url: z.string().optional(),
});

const SkillCategorySchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
});

const PreferencesSchema = z.object({
  jobTitles: z.array(z.string()),
  locations: z.array(z.string()),
  remoteOnly: z.boolean().default(false),
  minSalary: z.number().optional(),
  maxJobAgeDays: z.number().default(7),
  blacklistedCompanies: z.array(z.string()).default([]),
});

const UserConfigSchema = z.object({
  id: z.string(), // Unique identifier for multi-user support
  identity: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    linkedinUrl: z.string().url(),
    portfolioUrl: z.string().url().optional(),
    location: z.string(),
  }),
  preferences: PreferencesSchema,
  experience: z.array(ExperienceSchema),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string(),
      graduationDate: z.string(),
    })
  ),
  projects: z.array(ProjectSchema),
  skills: z.array(SkillCategorySchema),
  coverLetterTemplate: z.string(),
});

// ── Types ────────────────────────────────────────────────────────────────────

export type UserConfig = z.infer<typeof UserConfigSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;

// ── Validate helper ──────────────────────────────────────────────────────────

export function validateUserConfig(config: unknown): UserConfig {
  return UserConfigSchema.parse(config);
}

// ── Default Profile (fill in your details) ───────────────────────────────────

export const defaultProfile: UserConfig = {
  id: "user-001",
  identity: {
    name: "Your Name",
    email: "you@example.com",
    phone: "+1-555-000-0000",
    linkedinUrl: "https://linkedin.com/in/yourprofile",
    portfolioUrl: "https://yourportfolio.dev",
    location: "San Francisco, CA",
  },
  preferences: {
    jobTitles: ["Software Engineer", "Full Stack Developer", "Backend Engineer"],
    locations: ["San Francisco, CA", "Remote"],
    remoteOnly: false,
    minSalary: 120000,
    maxJobAgeDays: 7,
    blacklistedCompanies: ["SpamCorp"],
  },
  experience: [
    {
      company: "Acme Inc.",
      role: "Senior Software Engineer",
      startDate: "2022-01",
      endDate: "Present",
      bullets: [
        "Led migration of monolithic Node.js API to microservices architecture, reducing deploy times by 70%",
        "Built real-time data pipeline processing 2M+ events/day using Kafka and TypeScript",
        "Implemented CI/CD pipeline with GitHub Actions, achieving 99.9% deployment success rate",
        "Mentored team of 4 junior engineers, establishing code review culture and engineering standards",
        "Designed and shipped OAuth2/OIDC authentication system serving 50K+ users",
      ],
    },
    {
      company: "StartupXYZ",
      role: "Software Engineer",
      startDate: "2020-03",
      endDate: "2021-12",
      bullets: [
        "Built full-stack features using React, Node.js, and PostgreSQL for B2B SaaS platform",
        "Reduced API response times by 60% through query optimization and Redis caching",
        "Developed automated testing suite covering 85% of codebase with Jest and Cypress",
        "Shipped Stripe integration handling $2M+ in annual recurring revenue",
        "Created internal CLI tooling that cut developer onboarding time from 2 days to 2 hours",
      ],
    },
  ],
  education: [
    {
      institution: "University of California, Berkeley",
      degree: "B.S.",
      field: "Computer Science",
      graduationDate: "2020",
    },
  ],
  projects: [
    {
      name: "OpenSource CLI Tool",
      description:
        "A developer productivity CLI with 500+ GitHub stars that automates common workflows.",
      technologies: ["TypeScript", "Node.js", "Commander.js"],
      url: "https://github.com/you/cli-tool",
    },
    {
      name: "Real-time Dashboard",
      description:
        "WebSocket-powered monitoring dashboard for distributed systems with custom alerting.",
      technologies: ["React", "D3.js", "WebSockets", "Go"],
    },
  ],
  skills: [
    {
      category: "Languages",
      items: ["TypeScript", "JavaScript", "Python", "Go", "SQL"],
    },
    {
      category: "Frontend",
      items: ["React", "Next.js", "Tailwind CSS", "HTML/CSS"],
    },
    {
      category: "Backend",
      items: ["Node.js", "Express", "FastAPI", "GraphQL", "REST"],
    },
    {
      category: "Infrastructure",
      items: ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD"],
    },
    {
      category: "Databases",
      items: ["PostgreSQL", "Redis", "MongoDB", "DynamoDB"],
    },
  ],
  coverLetterTemplate: `Dear Hiring Manager,

I am writing to express my strong interest in the {{jobTitle}} position at {{company}}. With my background in {{relevantSkills}}, I am confident I can make a meaningful contribution to your team.

{{customParagraph}}

In my current role, I have {{topAchievement}}. I am particularly drawn to {{company}} because {{companyReason}}.

I would welcome the opportunity to discuss how my experience aligns with your team's needs. Thank you for your consideration.

Best regards,
{{name}}`,
};
