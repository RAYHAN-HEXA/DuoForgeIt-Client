/**
 * Service Marketplace v2 catalogue — the seed content defined by PRD v2.0 §C/§D.
 *
 * Prices are EXACTLY as specified by the founders; `priceLabel` tests pin them.
 * Thesis writing / thesis preparation is deliberately absent everywhere (R5).
 * deliveryEstimateText is left null — shown only once an admin sets it (R6).
 */

export type FormFieldSeed = {
  key: string;
  label: string;
  type:
    | 'TEXT'
    | 'TEXTAREA'
    | 'NUMBER'
    | 'SELECT'
    | 'MULTISELECT'
    | 'DATE'
    | 'CHECKBOX'
    | 'FILE'
    | 'URL'
    | 'PHONE';
  options?: string[];
  required: boolean;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
    maxFiles?: number;
  };
  helpText?: string;
};

export type OptionSeed = {
  kind: 'PACKAGE' | 'ADDON';
  label: string;
  description?: string;
  priceFrom?: string;
  priceTo?: string;
};

export type ServiceSeed = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  serviceType:
    | 'SD_WEB'
    | 'COMMERCIAL_WEB'
    | 'JAVA_OOP'
    | 'PRESENTATION'
    | 'LAB_REPORT'
    | 'ASSIGNMENT_FORMATTING'
    | 'PROJECT_DOCUMENTATION'
    | 'HARDWARE_PROJECT'
    | 'PC_REPAIR'
    | 'CONSULTATION';
  pricingModel: 'FIXED' | 'STARTING_FROM' | 'RANGE' | 'CUSTOM_QUOTE';
  /** FIXED price; RANGE/STARTING_FROM floor. Always a plain money string. */
  basePrice: string;
  priceFrom?: string;
  priceTo?: string;
  priceNote?: string;
  revisionPolicy: string;
  features: string[];
  deliverables: string[];
  requirementsText: string;
  acceptedFileTypes: string[];
  faqs: Array<{ q: string; a: string }>;
  isFeatured?: boolean;
  isPopular?: boolean;
  founderDiscipline: 'WEB_SOFTWARE_ECOMMERCE' | 'DESIGN_DOCS_UX' | 'BOTH';
  packages: OptionSeed[];
  formFields: FormFieldSeed[];
};

export type CategorySeed = {
  slug: string;
  name: string;
  description: string;
  iconKey: string;
  services: ServiceSeed[];
};

/** File types accepted for customer attachments on every v2 service. */
const STANDARD_FILE_TYPES = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'txt',
  'zip',
  'png',
  'jpg',
  'jpeg',
];

const CODE_FILE_TYPES = [...STANDARD_FILE_TYPES, 'java', 'py', 'c', 'cpp', 'ipynb', 'csv', 'md'];

export const MARKETPLACE_CATALOGUE: CategorySeed[] = [
  // ─── 1. Web Development ──────────────────────────────────────
  {
    slug: 'web-development',
    name: 'Web Development',
    description:
      'Semester project websites and commercial web builds — from course-specified SD projects to business-ready sites and online stores.',
    iconKey: 'Globe',
    services: [
      {
        slug: 'software-development-1',
        name: 'Software Development I (SD-1)',
        tagline: 'SD-1 semester project built to your exact course spec.',
        description:
          'Software Development I (SD-1) semester project built precisely to the specification your course provides. We scope the build, agree the plan with you, and deliver a working project with everything needed to run and present it. The project report is not included by default — add it as an option if you need one.',
        serviceType: 'SD_WEB',
        pricingModel: 'STARTING_FROM',
        basePrice: '1500.00',
        priceFrom: '1500.00',
        priceNote: 'Starting price for SD-1. The final quotation depends on your course specification.',
        revisionPolicy:
          'Two revision rounds are included within the agreed scope after first delivery. Scope changes or new features are quoted separately before any extra work begins.',
        features: [
          'Built exactly to your SD-1 course specification',
          'Walkthrough of the finished project where agreed',
          'Setup instructions so you can run it yourself',
        ],
        deliverables: [
          'Complete source code (zipped)',
          'Setup/run instructions',
          'Any agreed screenshots or demo assets',
        ],
        requirementsText:
          'Share your course specification or project brief, your deadline, and any reference files your instructor provided. Tell us whether you need a project report (available as an add-on).',
        acceptedFileTypes: CODE_FILE_TYPES,
        faqs: [
          {
            q: 'Is the project report included?',
            a: 'No — the service covers the working project only. You can add a formatted project report as an add-on.',
          },
          {
            q: 'What does the final price depend on?',
            a: '৳1,500 is the starting price. The quotation may adjust for complexity, extra features, or a tight deadline — you approve it before any work begins.',
          },
        ],
        isPopular: true,
        founderDiscipline: 'WEB_SOFTWARE_ECOMMERCE',
        packages: [
          {
            kind: 'ADDON',
            label: 'Project report',
            description: 'Formatted project report (DOCX/PDF) — not included by default',
            priceFrom: '200.00',
            priceTo: '300.00',
          },
        ],
        formFields: [
          {
            key: 'project_title',
            label: 'Project title',
            type: 'TEXT',
            required: true,
            validation: { minLength: 3, maxLength: 160 },
          },
          {
            key: 'requirements',
            label: 'Requirements / specification',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
            helpText: 'Paste or summarise your course specification here.',
          },
          {
            key: 'report_required',
            label: 'Project report required?',
            type: 'CHECKBOX',
            required: false,
            helpText: 'The report is an add-on (৳200-৳300) and is quoted in your quotation.',
          },
          { key: 'deadline', label: 'Deadline', type: 'DATE', required: false },
          {
            key: 'reference_files',
            label: 'Reference files',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
            helpText: 'Course spec PDFs, diagrams or instructor files.',
          },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
      {
        slug: 'software-development-2',
        name: 'Software Development II (SD-2)',
        tagline: 'SD-2 semester project with mid-level scope, built to spec.',
        description:
          'Software Development II (SD-2) semester project built precisely to the specification your course provides — typically larger in scope than SD-1, with database integration, dashboards or multi-role features as required. The project report is not included by default — add it as an option if you need one.',
        serviceType: 'SD_WEB',
        pricingModel: 'STARTING_FROM',
        basePrice: '2000.00',
        priceFrom: '2000.00',
        priceNote: 'Starting price for SD-2. The final quotation depends on your course specification.',
        revisionPolicy:
          'Two revision rounds are included within the agreed scope after first delivery. Scope changes or new features are quoted separately before any extra work begins.',
        features: [
          'Built exactly to your SD-2 course specification',
          'Database integration and dashboards where required',
          'Walkthrough of the finished project where agreed',
          'Setup instructions so you can run it yourself',
        ],
        deliverables: [
          'Complete source code (zipped)',
          'Setup/run instructions',
          'Any agreed screenshots or demo assets',
        ],
        requirementsText:
          'Share your course specification or project brief, your deadline, and any reference files your instructor provided. Tell us whether you need a project report (available as an add-on).',
        acceptedFileTypes: CODE_FILE_TYPES,
        faqs: [
          {
            q: 'Is the project report included?',
            a: 'No — the service covers the working project only. You can add a formatted project report as an add-on.',
          },
          {
            q: 'What does the final price depend on?',
            a: '৳2,000 is the starting price. The quotation may adjust for complexity, extra features, or a tight deadline — you approve it before any work begins.',
          },
        ],
        isPopular: true,
        founderDiscipline: 'WEB_SOFTWARE_ECOMMERCE',
        packages: [
          {
            kind: 'ADDON',
            label: 'Project report',
            description: 'Formatted project report (DOCX/PDF) — not included by default',
            priceFrom: '200.00',
            priceTo: '300.00',
          },
        ],
        formFields: [
          {
            key: 'project_title',
            label: 'Project title',
            type: 'TEXT',
            required: true,
            validation: { minLength: 3, maxLength: 160 },
          },
          {
            key: 'requirements',
            label: 'Requirements / specification',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
            helpText: 'Paste or summarise your course specification here.',
          },
          {
            key: 'report_required',
            label: 'Project report required?',
            type: 'CHECKBOX',
            required: false,
            helpText: 'The report is an add-on (৳200-৳300) and is quoted in your quotation.',
          },
          { key: 'deadline', label: 'Deadline', type: 'DATE', required: false },
          {
            key: 'reference_files',
            label: 'Reference files',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
            helpText: 'Course spec PDFs, diagrams or instructor files.',
          },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
      {
        slug: 'software-development-3',
        name: 'Software Development III (SD-3)',
        tagline: 'SD-3 semester project with advanced scope, built to spec.',
        description:
          'Software Development III (SD-3) semester project built precisely to the specification your course provides — the most advanced SD level, typically with authentication, full CRUD, dashboards and backend functionality as required. The project report is not included by default — add it as an option if you need one.',
        serviceType: 'SD_WEB',
        pricingModel: 'STARTING_FROM',
        basePrice: '2500.00',
        priceFrom: '2500.00',
        priceNote: 'Starting price for SD-3. The final quotation depends on your course specification.',
        revisionPolicy:
          'Two revision rounds are included within the agreed scope after first delivery. Scope changes or new features are quoted separately before any extra work begins.',
        features: [
          'Built exactly to your SD-3 course specification',
          'Authentication, CRUD and dashboards where required',
          'Walkthrough of the finished project where agreed',
          'Setup instructions so you can run it yourself',
        ],
        deliverables: [
          'Complete source code (zipped)',
          'Setup/run instructions',
          'Any agreed screenshots or demo assets',
        ],
        requirementsText:
          'Share your course specification or project brief, your deadline, and any reference files your instructor provided. Tell us whether you need a project report (available as an add-on).',
        acceptedFileTypes: CODE_FILE_TYPES,
        faqs: [
          {
            q: 'Is the project report included?',
            a: 'No — the service covers the working project only. You can add a formatted project report as an add-on.',
          },
          {
            q: 'What does the final price depend on?',
            a: '৳2,500 is the starting price. The quotation may adjust for complexity, extra features, or a tight deadline — you approve it before any work begins.',
          },
        ],
        isPopular: true,
        founderDiscipline: 'WEB_SOFTWARE_ECOMMERCE',
        packages: [
          {
            kind: 'ADDON',
            label: 'Project report',
            description: 'Formatted project report (DOCX/PDF) — not included by default',
            priceFrom: '200.00',
            priceTo: '300.00',
          },
        ],
        formFields: [
          {
            key: 'project_title',
            label: 'Project title',
            type: 'TEXT',
            required: true,
            validation: { minLength: 3, maxLength: 160 },
          },
          {
            key: 'requirements',
            label: 'Requirements / specification',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
            helpText: 'Paste or summarise your course specification here.',
          },
          {
            key: 'report_required',
            label: 'Project report required?',
            type: 'CHECKBOX',
            required: false,
            helpText: 'The report is an add-on (৳200-৳300) and is quoted in your quotation.',
          },
          { key: 'deadline', label: 'Deadline', type: 'DATE', required: false },
          {
            key: 'reference_files',
            label: 'Reference files',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
            helpText: 'Course spec PDFs, diagrams or instructor files.',
          },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
      {
        slug: 'commercial-web-development',
        name: 'Commercial Web Development',
        tagline: 'Business sites, landing pages, stores and booking systems — quoted to scope.',
        description:
          'Professional web development for real businesses: company websites, personal portfolios, landing pages, e-commerce stores, booking systems, and custom web applications. Every build starts from your goals and budget — we scope it, quote it, and deliver a fast, mobile-first site you can actually maintain.',
        serviceType: 'COMMERCIAL_WEB',
        pricingModel: 'CUSTOM_QUOTE',
        basePrice: '0.00',
        revisionPolicy:
          'Two revision rounds within the agreed scope. Additional pages, integrations or redesigns are quoted separately.',
        features: [
          'Scoped and quoted before any work begins',
          'Mobile-first, fast-loading builds',
          'E-commerce, booking and custom app capabilities',
          'Deployment and handover included',
        ],
        deliverables: [
          'Deployed website',
          'Source code repository or zip',
          'Content/admin handover notes',
        ],
        requirementsText:
          'Tell us the project type, what the site must do, and share any references (sites you like, brand assets, copy). The final quotation depends on pages, features and integrations.',
        acceptedFileTypes: STANDARD_FILE_TYPES,
        faqs: [
          {
            q: 'Why is there no listed price?',
            a: 'Business sites vary too much in scope to price fairly up front. Submit the form — you get a line-item quotation before anything is agreed.',
          },
        ],
        isFeatured: true,
        founderDiscipline: 'WEB_SOFTWARE_ECOMMERCE',
        packages: [],
        formFields: [
          {
            key: 'project_type',
            label: 'Project type',
            type: 'SELECT',
            options: [
              'Business website',
              'Portfolio',
              'Landing page',
              'E-commerce store',
              'Booking system',
              'Custom web app',
            ],
            required: true,
          },
          {
            key: 'requirements',
            label: 'What the site must do',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
          },
          { key: 'pages_needed', label: 'Approximate number of pages', type: 'NUMBER', required: false, validation: { min: 1, max: 200 } },
          { key: 'reference_url', label: 'Reference site (URL)', type: 'URL', required: false },
          { key: 'deadline', label: 'Target launch date', type: 'DATE', required: false },
          {
            key: 'files',
            label: 'Brand assets / content',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
          },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
    ],
  },

  // ─── 2. Software & Programming Projects ──────────────────────
  {
    slug: 'software-projects',
    name: 'Software & Programming Projects',
    description:
      'Java & OOP coursework projects, walkthroughs and programming-language builds — quoted to your course requirements.',
    iconKey: 'Code2',
    services: [
      {
        slug: 'java-oop-project',
        name: 'Java & OOP Project Development',
        tagline: 'OOP course projects with clean class design — console, Swing or other UIs.',
        description:
          'Java projects built around the object-oriented principles your course teaches: proper class design, inheritance, interfaces, collections and file handling where required. Choose console or a graphical interface (Swing/other), tell us the required features, and we build it to spec — with a walkthrough/explanation session where agreed so you can present and defend the work.',
        serviceType: 'JAVA_OOP',
        pricingModel: 'CUSTOM_QUOTE',
        basePrice: '0.00',
        revisionPolicy:
          'Two revision rounds within the agreed feature list. Feature additions after the quotation are quoted separately.',
        features: [
          'Clean OOP design your course expects',
          'Console, Swing or other Java interface on request',
          'Walkthrough/explanation where agreed',
          'Compiles and runs with provided instructions',
        ],
        deliverables: [
          'Complete Java source code (zipped)',
          'Compile/run instructions',
          'Any agreed walkthrough notes or session',
        ],
        requirementsText:
          'Tell us your course (OOP / OOP Lab / other), the project title, the required features, and your preferred interface. Attach the assignment sheet if you have one.',
        acceptedFileTypes: CODE_FILE_TYPES,
        faqs: [
          {
            q: 'Can you explain the code to me?',
            a: 'Yes — where agreed in the quotation we include a walkthrough so you understand the design and can answer questions about it.',
          },
        ],
        founderDiscipline: 'WEB_SOFTWARE_ECOMMERCE',
        packages: [],
        formFields: [
          {
            key: 'course',
            label: 'Course',
            type: 'SELECT',
            options: ['OOP', 'OOP Lab', 'Other'],
            required: true,
          },
          {
            key: 'project_title',
            label: 'Project title',
            type: 'TEXT',
            required: true,
            validation: { minLength: 3, maxLength: 160 },
          },
          {
            key: 'brief',
            label: 'Project brief',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
          },
          {
            key: 'required_features',
            label: 'Required features',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 5, maxLength: 5000 },
            helpText: 'List the features your assignment requires, one per line.',
          },
          {
            key: 'java_interface',
            label: 'Preferred Java interface',
            type: 'SELECT',
            options: ['Console', 'Swing', 'Other'],
            required: true,
          },
          { key: 'walkthrough_needed', label: 'Walkthrough / explanation needed?', type: 'CHECKBOX', required: false },
          { key: 'deadline', label: 'Deadline', type: 'DATE', required: false },
          {
            key: 'attachments',
            label: 'Assignment sheet / references',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
          },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
    ],
  },

  // ─── 3. Academic Documentation & Presentation ────────────────
  {
    slug: 'academic-documentation-presentation',
    name: 'Academic Documentation & Presentation',
    description:
      'Presentation slides, lab reports, assignment formatting and project documentation — clean, well-structured academic documents.',
    iconKey: 'BookOpen',
    services: [
      {
        slug: 'presentation-design',
        name: 'Presentation Design',
        tagline: '৳500 for 10 polished slides — with guidance on what to highlight.',
        description:
          'A presentation package that goes beyond pretty slides: you get a clean, well-designed deck (PPTX and PDF) for exactly 10 slides at a fixed ৳500, plus guidance on which points to emphasise and how to present them. Additional slides are quoted as a separate quotation.',
        serviceType: 'PRESENTATION',
        pricingModel: 'FIXED',
        basePrice: '500.00',
        priceNote: 'Fixed ৳500 for 10 slides. Additional slides require a separate quotation.',
        revisionPolicy:
          'One revision round on design/layout within the agreed 10 slides. Content changes after delivery are quoted separately.',
        features: [
          'Fixed ৳500 for a 10-slide deck',
          'PPTX and PDF delivery',
          'Presentation guidance: what to highlight, slide by slide',
          'Clean layout with consistent typography and colours',
        ],
        deliverables: [
          'Editable PPTX file',
          'PDF export',
          'Slide-by-slide presentation guidance note',
        ],
        requirementsText:
          'Share your topic, subject/course, the slide count (packages cover 10 slides), any reference materials, and your presentation date.',
        acceptedFileTypes: STANDARD_FILE_TYPES,
        faqs: [
          {
            q: 'What if I need more than 10 slides?',
            a: 'The fixed package covers exactly 10 slides. Additional slides are quoted as a separate quotation before any work begins.',
          },
          {
            q: 'Do you write the content too?',
            a: 'We structure and design what you provide, and advise what to emphasise. This service is not academic writing — see our documentation service for project documents.',
          },
        ],
        isFeatured: true,
        founderDiscipline: 'DESIGN_DOCS_UX',
        packages: [],
        formFields: [
          { key: 'topic', label: 'Topic', type: 'TEXT', required: true, validation: { minLength: 3, maxLength: 200 } },
          { key: 'subject_course', label: 'Subject / course', type: 'TEXT', required: false, validation: { maxLength: 160 } },
          {
            key: 'slide_count',
            label: 'Number of slides',
            type: 'NUMBER',
            required: true,
            validation: { min: 1, max: 100, message: 'Slides must be between 1 and 100' },
            helpText: 'The fixed package covers 10 slides — extra slides are quoted separately.',
          },
          {
            key: 'reference_materials',
            label: 'Reference materials',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
          },
          { key: 'presentation_date', label: 'Presentation date', type: 'DATE', required: false },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
      {
        slug: 'lab-report-preparation',
        name: 'Lab Report Preparation',
        tagline: 'A set of 5 lab reports, formatted to your instructor\'s template — ৳200-৳300.',
        description:
          'Neat, properly structured lab reports for your practical courses: observations, data tables, results and conclusions organised exactly the way your instructor requires. Priced ৳200-৳300 for a set of 5 reports depending on length and formatting complexity.',
        serviceType: 'LAB_REPORT',
        pricingModel: 'RANGE',
        basePrice: '200.00',
        priceFrom: '200.00',
        priceTo: '300.00',
        priceNote: '৳200-৳300 for a set of 5 reports, depending on complexity and formatting.',
        revisionPolicy: 'One revision round for formatting corrections within the agreed template.',
        features: [
          'Formatted to your instructor\'s template',
          'Data tables, figures and results properly presented',
          'Set of 5 reports per package',
          'PDF and DOCX delivery',
        ],
        deliverables: ['DOCX file(s)', 'PDF export(s)'],
        requirementsText:
          'Tell us the course, list the experiments, how many reports you need, and your instructor\'s format. Upload your raw data/observations where you have them.',
        acceptedFileTypes: STANDARD_FILE_TYPES,
        faqs: [
          {
            q: 'What does the price depend on?',
            a: 'The final quotation (within ৳200-৳300 for 5 reports) depends on report length, graphs/figures needed and how strict the formatting template is.',
          },
        ],
        founderDiscipline: 'DESIGN_DOCS_UX',
        packages: [],
        formFields: [
          { key: 'course', label: 'Course', type: 'TEXT', required: true, validation: { maxLength: 160 } },
          {
            key: 'experiment_list',
            label: 'Experiment list',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 5, maxLength: 5000 },
            helpText: 'One experiment per line.',
          },
          {
            key: 'report_count',
            label: 'Number of reports',
            type: 'NUMBER',
            required: true,
            validation: { min: 1, max: 20 },
          },
          { key: 'instructor_format', label: 'Instructor\'s format / template notes', type: 'TEXT', required: false, validation: { maxLength: 1000 } },
          {
            key: 'source_materials',
            label: 'Raw data / observations',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
          },
          { key: 'deadline', label: 'Deadline', type: 'DATE', required: false },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
      {
        slug: 'assignment-formatting',
        name: 'Assignment Preparation & Formatting',
        tagline: 'Cleanly formatted Word assignments up to 30 pages — ৳200-৳300.',
        description:
          'Professional formatting for your assignment documents in Word: cover pages, tables of contents, consistent heading styles, page numbers, tables and figures — up to 30 pages, for ৳200-৳300. This is legitimate learning support for presenting YOUR work cleanly; it is not content writing.',
        serviceType: 'ASSIGNMENT_FORMATTING',
        pricingModel: 'RANGE',
        basePrice: '200.00',
        priceFrom: '200.00',
        priceTo: '300.00',
        priceNote: '৳200-৳300 for up to 30 pages, depending on formatting complexity.',
        revisionPolicy: 'One revision round for formatting corrections.',
        features: [
          'Cover page, TOC, heading styles, page numbers',
          'Tables and figures consistently formatted',
          'Up to 30 pages per package',
          'Delivered as DOCX (+PDF on request)',
        ],
        deliverables: ['Formatted DOCX', 'PDF export (on request)'],
        requirementsText:
          'Share your topic, page count, any institutional formatting instructions, and upload your content document.',
        acceptedFileTypes: STANDARD_FILE_TYPES,
        faqs: [
          {
            q: 'Do you write the assignment content?',
            a: 'No. We format and present the content you provide — this is presentation and formatting support only.',
          },
        ],
        founderDiscipline: 'DESIGN_DOCS_UX',
        packages: [],
        formFields: [
          { key: 'topic', label: 'Topic', type: 'TEXT', required: true, validation: { minLength: 3, maxLength: 200 } },
          {
            key: 'page_count',
            label: 'Page count',
            type: 'NUMBER',
            required: true,
            validation: { min: 1, max: 30, message: 'This package covers up to 30 pages' },
          },
          {
            key: 'formatting_instructions',
            label: 'Formatting instructions',
            type: 'TEXTAREA',
            required: false,
            validation: { maxLength: 3000 },
            helpText: 'Institutional template, font, spacing or citation-style requirements.',
          },
          {
            key: 'source_materials',
            label: 'Your content document',
            type: 'FILE',
            required: true,
            validation: { maxFiles: 5 },
          },
          { key: 'deadline', label: 'Deadline', type: 'DATE', required: false },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
      {
        slug: 'project-proposal-report',
        name: 'Project Proposal & Final Project Report',
        tagline: 'Software or hardware project documentation — ৳400-৳500.',
        description:
          'Structured documentation for software or hardware course projects: project proposals and final project reports with proper sections, figures, diagrams and references — ৳400-৳500 depending on depth and institutional template. Important: this service covers course-project documents only — graduate research documents are not offered on TechService Hub.',
        serviceType: 'PROJECT_DOCUMENTATION',
        pricingModel: 'RANGE',
        basePrice: '400.00',
        priceFrom: '400.00',
        priceTo: '500.00',
        priceNote: '৳400-৳500 depending on document depth and template requirements.',
        revisionPolicy: 'One revision round within the agreed template and structure.',
        features: [
          'Proposal and/or final report structure',
          'Software or hardware project documentation',
          'Figures, diagrams and references handled properly',
          'Follows your institutional template',
        ],
        deliverables: ['DOCX report/proposal', 'PDF export'],
        requirementsText:
          'Tell us the project type (software/hardware), whether you need the proposal, the final report or both, and describe the project. Upload your institutional template if you have one.',
        acceptedFileTypes: STANDARD_FILE_TYPES,
        faqs: [
          {
            q: 'Which documents does this cover?',
            a: 'Project proposals and final project reports for software or hardware course projects. Graduate research documents are not offered on TechService Hub.',
          },
        ],
        founderDiscipline: 'DESIGN_DOCS_UX',
        packages: [],
        formFields: [
          {
            key: 'project_type',
            label: 'Project type',
            type: 'SELECT',
            options: ['Software', 'Hardware'],
            required: true,
          },
          {
            key: 'doc_stage',
            label: 'What you need',
            type: 'MULTISELECT',
            options: ['Proposal', 'Final report'],
            required: true,
          },
          {
            key: 'details',
            label: 'Project details',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
          },
          {
            key: 'institutional_template',
            label: 'Institutional template',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 3 },
          },
          {
            key: 'attachments',
            label: 'Project files / references',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
          },
          { key: 'deadline', label: 'Deadline', type: 'DATE', required: false },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
    ],
  },

  // ─── 4. Hardware & Engineering Projects ──────────────────────
  {
    slug: 'hardware-engineering-projects',
    name: 'Hardware & Engineering Projects',
    description:
      'Arduino, sensor, circuit and embedded builds — designed, wired, coded and documented.',
    iconKey: 'Cpu',
    services: [
      {
        slug: 'hardware-project-assistance',
        name: 'Hardware & Software Project Assistance',
        tagline: 'Arduino, sensors, circuits and embedded systems — scoped and quoted.',
        description:
          'Hands-on assistance for hardware and embedded course projects: Arduino builds, sensor integration, circuit design and embedded software. We scope the build with you, quote it, then assemble, code and document it — with wiring diagrams and a components list so you can rebuild and present it.',
        serviceType: 'HARDWARE_PROJECT',
        pricingModel: 'CUSTOM_QUOTE',
        basePrice: '0.00',
        revisionPolicy:
          'Two revision rounds within the agreed build scope. Component substitutions (availability) are discussed before purchase.',
        features: [
          'Arduino / embedded builds to your course spec',
          'Sensor and circuit integration',
          'Wiring diagrams and components list',
          'Simulation where useful before assembly',
        ],
        deliverables: [
          'Working build (as agreed)',
          'Embedded source code',
          'Wiring diagram + components list',
        ],
        requirementsText:
          'Describe the project, the components you already have, and your deadline. Attach the course brief — component costs are quoted separately from service cost.',
        acceptedFileTypes: CODE_FILE_TYPES,
        faqs: [
          {
            q: 'Are hardware components included in the price?',
            a: 'No — the quotation covers our work. Component costs are listed separately in the quotation and depend on availability.',
          },
        ],
        founderDiscipline: 'BOTH',
        packages: [],
        formFields: [
          {
            key: 'project_title',
            label: 'Project title',
            type: 'TEXT',
            required: true,
            validation: { minLength: 3, maxLength: 160 },
          },
          {
            key: 'brief',
            label: 'Project brief',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
          },
          {
            key: 'components_available',
            label: 'Components you already have',
            type: 'TEXTAREA',
            required: false,
            validation: { maxLength: 3000 },
          },
          { key: 'simulation_needed', label: 'Simulation before assembly?', type: 'CHECKBOX', required: false },
          { key: 'deadline', label: 'Deadline', type: 'DATE', required: false },
          {
            key: 'attachments',
            label: 'Course brief / diagrams',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
          },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
    ],
  },

  // ─── 5. PC & Laptop Repair Support ───────────────────────────
  {
    slug: 'pc-laptop-repair',
    name: 'PC & Laptop Repair Support',
    description:
      'Diagnosis-first repair support for laptops and desktops — you approve the estimated cost before any work begins.',
    iconKey: 'Laptop',
    services: [
      {
        slug: 'pc-laptop-repair-support',
        name: 'PC & Laptop Repair Support',
        tagline: 'Tell us the symptoms — we diagnose, quote, and you approve before anything starts.',
        description:
          'A diagnosis-and-quotation repair service for laptops and desktops. You describe the device and symptoms (photos optional); we record a diagnosis and send you an estimated repair cost. The final cost depends on the diagnosis, parts availability and the work required. No repair work ever begins without your explicit approval of the estimate.',
        serviceType: 'PC_REPAIR',
        pricingModel: 'CUSTOM_QUOTE',
        basePrice: '0.00',
        priceNote:
          'Final cost depends on diagnosis, parts availability and work required. Diagnosis and estimate are provided before any repair begins.',
        revisionPolicy:
          'Re-work on the repaired issue within 7 days of completion is covered — report the same symptom and we re-check it.',
        features: [
          'Structured issue categories for fast triage',
          'Written diagnosis with estimated cost',
          'No repair begins without your approval',
          'Progress updates until completion',
        ],
        deliverables: ['Diagnosis notes', 'Repair completion summary'],
        requirementsText:
          'Choose your device type and issue category, describe the symptoms as precisely as you can, and add photos if helpful. Location and preferred contact method help us schedule the diagnosis.',
        acceptedFileTypes: ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'txt'],
        faqs: [
          {
            q: 'When do I know the cost?',
            a: 'After the diagnosis you receive an estimated repair cost as a quotation. Nothing is charged and no work starts until you approve it.',
          },
          {
            q: 'What if the estimate is too high?',
            a: 'You can decline the estimate — the request simply closes with no charge.',
          },
        ],
        isPopular: true,
        founderDiscipline: 'BOTH',
        packages: [],
        formFields: [
          {
            key: 'device_type',
            label: 'Device type',
            type: 'SELECT',
            options: ['Laptop', 'Desktop'],
            required: true,
          },
          {
            key: 'issue_category',
            label: 'Issue category',
            type: 'SELECT',
            options: [
              'Windows won\'t boot',
              'Software & drivers',
              'Slow performance',
              'Hardware diagnosis needed',
              'Laptop-specific issue',
              'General troubleshooting',
            ],
            required: true,
          },
          { key: 'brand', label: 'Brand', type: 'TEXT', required: true, validation: { maxLength: 80 } },
          { key: 'model', label: 'Model', type: 'TEXT', required: false, validation: { maxLength: 120 } },
          {
            key: 'symptoms',
            label: 'Symptoms — what exactly happens?',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 3000 },
          },
          { key: 'location', label: 'Your location / area', type: 'TEXT', required: false, validation: { maxLength: 160 } },
          {
            key: 'contact_preference',
            label: 'Preferred contact method',
            type: 'SELECT',
            options: ['WhatsApp', 'Phone', 'Email', 'In-app'],
            required: false,
          },
          {
            key: 'photos',
            label: 'Photos of the issue (optional)',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
            helpText: 'Error screens, damage photos — up to 5 images.',
          },
        ],
      },
    ],
  },

  // ─── 6. IT Consultation & Project Assistance ─────────────────
  {
    slug: 'custom-it-solutions', // reuses the legacy category row (name updated)
    name: 'IT Consultation & Project Assistance',
    description:
      'One-on-one help from the founders: OOP concepts, programming guidance, debugging and project planning.',
    iconKey: 'Lightbulb',
    services: [
      {
        slug: 'it-consultation',
        name: 'IT Consultation & Project Assistance',
        tagline: 'OOP help, debugging, guidance and planning — direct with a founder.',
        description:
          'Focused consultation sessions and project assistance: OOP concept help, programming guidance, debugging sessions, and project planning. You describe what you are stuck on; we agree the scope and format (session or task-based) and quote it before starting.',
        serviceType: 'CONSULTATION',
        pricingModel: 'CUSTOM_QUOTE',
        basePrice: '0.00',
        revisionPolicy: 'Follow-up questions within the agreed session scope are included.',
        features: [
          'Direct access to a founder',
          'OOP and programming concept help',
          'Debugging sessions on your code',
          'Project planning and scoping advice',
        ],
        deliverables: ['Session notes / action list', 'Any agreed code snippets or fixes'],
        requirementsText:
          'Tell us what kind of help you need, describe the problem or project, and attach relevant code or error screenshots.',
        acceptedFileTypes: CODE_FILE_TYPES,
        faqs: [
          {
            q: 'How is this priced?',
            a: 'Consultation is quoted per engagement after you describe the scope — small debugging tasks cost less than full planning sessions.',
          },
        ],
        founderDiscipline: 'BOTH',
        packages: [],
        formFields: [
          {
            key: 'help_type',
            label: 'What kind of help?',
            type: 'MULTISELECT',
            options: ['OOP help', 'Programming guidance', 'Debugging', 'Project planning'],
            required: true,
          },
          {
            key: 'details',
            label: 'Describe your problem or project',
            type: 'TEXTAREA',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
          },
          { key: 'deadline', label: 'When do you need it?', type: 'DATE', required: false },
          {
            key: 'attachments',
            label: 'Code / error screenshots',
            type: 'FILE',
            required: false,
            validation: { maxFiles: 5 },
          },
          { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
        ],
      },
    ],
  },
];

/** Legacy catalog service slugs — archived (never deleted) when v2 seeds. */
export const LEGACY_SERVICE_SLUGS = [
  'business-website',
  'pitch-deck-design',
  'product-documentation',
  'custom-software-project',
  'product-ui-ux-design',
  'online-store',
  'it-consulting-sprint',
] as const;

/** Superseded v2 slugs — archived when their replacement ships (soft delete). */
export const REPLACED_SERVICE_SLUGS = ['sd-project-development'] as const;

/** Per-method payment config defaults (Addendum ADM-06 / §19 Q4+Q8). */
export const PAYMENT_METHOD_SEED: Array<{
  method: string;
  enabled: boolean;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  minDeposit: string;
  maxDeposit: string;
  minWithdraw: string;
  maxWithdraw: string;
}> = [
  { method: 'BKASH', enabled: true, depositEnabled: true, withdrawEnabled: true, minDeposit: '100.00', maxDeposit: '50000.00', minWithdraw: '200.00', maxWithdraw: '50000.00' },
  { method: 'NAGAD', enabled: true, depositEnabled: true, withdrawEnabled: true, minDeposit: '100.00', maxDeposit: '50000.00', minWithdraw: '200.00', maxWithdraw: '50000.00' },
  { method: 'ROCKET', enabled: true, depositEnabled: true, withdrawEnabled: true, minDeposit: '100.00', maxDeposit: '50000.00', minWithdraw: '200.00', maxWithdraw: '50000.00' },
  { method: 'BINANCE', enabled: true, depositEnabled: true, withdrawEnabled: true, minDeposit: '100.00', maxDeposit: '50000.00', minWithdraw: '200.00', maxWithdraw: '50000.00' },
  { method: 'BANK_TRANSFER', enabled: false, depositEnabled: false, withdrawEnabled: false, minDeposit: '500.00', maxDeposit: '50000.00', minWithdraw: '500.00', maxWithdraw: '50000.00' },
];

/** Wallet-wide setting defaults (WalletSetting rows, admin-editable later). */
export const WALLET_SETTINGS_SEED: Record<string, unknown> = {
  usdt_bdt_rate: null, // admin must set before BINANCE deposits are accepted
  usdt_rate_updated_at: null,
  stale_deposit_hours: 72,
  daily_withdrawal_cap: '100000.00',
  holding_period_hours: 24,
  refund_policy_text:
    'Refunds are credited to your TechService Hub wallet. Cash-out to bKash/Nagad/Rocket is done through a withdrawal request, reviewed by our team.',
  wallet_maintenance_mode: false,
};
