/**
 * Starting point for ICLCA's programs. These are placeholders based on public
 * descriptions: admins should edit them (Admin → Certifications → Programs)
 * to match the current official requirements.
 */
type DefaultCriterion = { section: string; title: string; guidance: string; evidenceRequired?: boolean; level?: string };
type DefaultProgram = {
  key: string;
  name: string;
  kind: "INDIVIDUAL" | "CENTER";
  description: string;
  initialValidityMonths: number;
  renewalValidityMonths: number;
  levels: { name: string; description: string; lifetime?: boolean; feeNote?: string }[];
  criteria: DefaultCriterion[];
};

const PLACEHOLDER = "\n\n_Placeholder — edit to match ICLCA's current requirements._";

export const DEFAULT_PROGRAMS: DefaultProgram[] = [
  {
    key: "lclc",
    name: "Learning Center Leadership Certification (LCLC)",
    kind: "INDIVIDUAL",
    description:
      "Recognizes learning center professionals' education, experience, professional development and service. Applicants may apply at any of the four levels. Initial certification is valid for two years; renewals are valid for five years; Level 4 is a lifetime certification." +
      PLACEHOLDER,
    initialValidityMonths: 24,
    renewalValidityMonths: 60,
    levels: [
      { name: "Level 1", description: "Entry-level learning center professional." + PLACEHOLDER },
      { name: "Level 2", description: "Established learning center professional." + PLACEHOLDER },
      { name: "Level 3", description: "Master's degree, six to ten years of learning assistance experience, and service to the profession." + PLACEHOLDER },
      { name: "Level 4 (Lifetime)", description: "Sustained, documented excellence over many years — ICLCA's highest certification." + PLACEHOLDER, lifetime: true },
    ],
    criteria: [
      { section: "Background", title: "Education", guidance: "List your degrees and relevant coursework. Upload or link transcripts or diplomas." },
      { section: "Background", title: "Professional experience", guidance: "Describe your learning assistance positions, years in each, and responsibilities. Attach a current CV/résumé." },
      { section: "Philosophy", title: "Learning assistance statement", guidance: "Describe your philosophy of learning assistance and how it guides your work.", evidenceRequired: false },
      { section: "Growth", title: "Professional development plan", guidance: "Outline your goals and planned professional development for the certification period." },
      { section: "Service", title: "Service to the profession", guidance: "List conference presentations, publications, committee work and other service. Provide links or documentation." },
    ],
  },
  {
    key: "lc-certification",
    name: "Learning Center Certification & Learning Center of Excellence",
    kind: "CENTER",
    description:
      "Recognizes learning centers that meet (Certification) or exceed (Learning Center of Excellence) ICLCA's standards. Submitted by the center's director with a narrative and evidence for each standard; reviewed by a committee of at least three reviewers." +
      PLACEHOLDER,
    initialValidityMonths: 60,
    renewalValidityMonths: 60,
    levels: [
      { name: "Learning Center Certification", description: "The center meets ICLCA's standards." + PLACEHOLDER },
      { name: "Learning Center of Excellence", description: "The center meets and exceeds ICLCA's standards." + PLACEHOLDER },
    ],
    criteria: [
      { section: "Organizational framework", title: "Mission statement", guidance: "Provide the center's mission statement and explain how it aligns with institutional goals." },
      { section: "Organizational framework", title: "Director's credentials", guidance: "The director holds LCLC Level 2 certification or meets Level 2 requirements. Provide the certification code or documentation." },
      { section: "Organizational framework", title: "Organizational structure & staffing", guidance: "Include an organizational chart and describe reporting lines, staffing and budget." },
      { section: "Programs & services", title: "Programs and services", guidance: "Describe the programs and services offered (tutoring, supplemental instruction, workshops, etc.) and who they serve." },
      { section: "Programs & services", title: "Staff training", guidance: "Describe training for tutors/staff. Attach training guides or certification documentation (e.g. CRLA/NTA)." },
      { section: "Assessment", title: "Assessment & evaluation", guidance: "Explain how the center assesses outcomes and uses data for improvement. Attach recent assessment reports." },
      { section: "Integrity", title: "Academic integrity & ethics", guidance: "Provide policies on academic integrity, confidentiality and ethical practice." },
      { section: "Summary", title: "Executive summary", guidance: "Summarize the center's strengths and why it merits this designation.", evidenceRequired: false },
    ],
  },
];
