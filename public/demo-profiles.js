// Fifty fictional AI careers. No customer data, real employer claims, or API calls.
const names = [
  'Mariam Adel', 'Omar Mostafa', 'Salma Nabil', 'Youssef Hany', 'Nour Hassan',
  'Ahmed Tarek', 'Farida Khaled', 'Mohamed Ashraf', 'Hana Sherif', 'Karim Emad',
  'Menna Hossam', 'Mahmoud Samir', 'Yasmin Wael', 'Mostafa Ayman', 'Habiba Walid',
  'Abdelrahman Fathy', 'Nada Hesham', 'Ali Gamal', 'Rana Medhat', 'Amr Nasser',
  'Dina Magdy', 'Hassan Ibrahim', 'Shahd Sameh', 'Khaled Osama', 'Malak Essam',
  'Seif Ehab', 'Aya Hamdy', 'Tarek Fouad', 'Laila Farouk', 'Islam Reda',
  'Reem Atef', 'Marwan Said', 'Nourhan Salah', 'Adham Ramy', 'Bassant Nader',
  'Hady Bassem', 'Asmaa Yasser', 'Zeyad Maged', 'Jana Hazem', 'Mazen Raafat',
  'Esraa Kamal', 'Shady Hatem', 'Mayar Tamer', 'Mina Nabil', 'Hend Adel',
  'Yehia Sherif', 'Hager Mostafa', 'Peter Samir', 'Dalia Emad', 'Fares Hossam',
];
const universities = ['Cairo University', 'Ain Shams University', 'Alexandria University', 'Mansoura University', 'Egypt-Japan University of Science and Technology'];
const cities = ['Cairo, Egypt', 'Giza, Egypt', 'Alexandria, Egypt', 'Mansoura, Egypt', 'Tanta, Egypt'];
const domains = [
  { layout: 'chronological', field: 'applied AI', company: 'Wasla AI Studio',
    roles: ['AI Engineer', 'Applied AI Engineer', 'AI Solutions Engineer', 'AI Integration Engineer', 'AI Automation Engineer'],
    tools: ['Python', 'FastAPI', 'PyTorch', 'PostgreSQL', 'Docker'],
    methods: ['Model evaluation', 'API design', 'Retrieval', 'Workflow automation', 'Error analysis'],
    problems: ['Arabic customer support', 'retail document processing', 'branch knowledge search', 'service request routing', 'invoice classification'],
    work: 'integrated model-backed services into existing business workflows',
    project: 'Arabic service assistant', research: 'Evaluating grounded responses in bilingual support systems' },
  { layout: 'chronological', field: 'machine learning', company: 'Nile Decision Systems',
    roles: ['Machine Learning Engineer', 'Recommendation Systems Engineer', 'Forecasting Engineer', 'Predictive Modelling Engineer', 'Applied ML Scientist'],
    tools: ['Python', 'scikit-learn', 'XGBoost', 'SQL', 'MLflow'],
    methods: ['Time-series validation', 'Feature engineering', 'Ranking', 'Calibration', 'Experiment tracking'],
    problems: ['Ramadan demand forecasting', 'online product discovery', 'stock replenishment', 'delivery demand planning', 'customer retention analysis'],
    work: 'built reproducible training pipelines and compared models against simple operational baselines',
    project: 'Seasonal demand forecasting', research: 'Comparing temporal validation strategies for retail forecasting' },
  { layout: 'technical', field: 'natural language processing', company: 'Lugha Language Lab',
    roles: ['NLP Engineer', 'Arabic NLP Engineer', 'Conversational AI Engineer', 'Speech AI Engineer', 'Language Model Engineer'],
    tools: ['Python', 'Transformers', 'PyTorch', 'spaCy', 'Sentence Transformers'],
    methods: ['Arabic normalisation', 'Text classification', 'Semantic search', 'Speech evaluation', 'Annotation design'],
    problems: ['Egyptian Arabic intent detection', 'bilingual search', 'Arabic speech transcripts', 'customer feedback classification', 'dialect-aware virtual assistance'],
    work: 'developed language pipelines for Arabic and English inputs with explicit dialect and spelling checks',
    project: 'Egyptian Arabic intent benchmark', research: 'Dialect variation in Arabic intent classification' },
  { layout: 'technical', field: 'computer vision', company: 'Basira Vision Systems',
    roles: ['Computer Vision Engineer', 'Visual AI Engineer', 'Image Recognition Engineer', 'Document AI Engineer', 'Video Analytics Engineer'],
    tools: ['Python', 'OpenCV', 'PyTorch', 'ONNX', 'CVAT'],
    methods: ['Object detection', 'Image augmentation', 'OCR evaluation', 'Dataset auditing', 'Inference profiling'],
    problems: ['Arabic document recognition', 'warehouse parcel inspection', 'shelf availability analysis', 'manufacturing quality checks', 'traffic scene understanding'],
    work: 'trained and evaluated vision models across changing lighting, camera angles, and image quality',
    project: 'Arabic document recognition pipeline', research: 'Robust visual recognition under real-world image variation' },
  { layout: 'hybrid', field: 'ML infrastructure', company: 'Masar Model Operations',
    roles: ['MLOps Engineer', 'ML Platform Engineer', 'AI Infrastructure Engineer', 'Model Deployment Engineer', 'ML Reliability Engineer'],
    tools: ['Python', 'Docker', 'Kubernetes', 'MLflow', 'GitHub Actions'],
    methods: ['CI/CD', 'Model registry', 'Drift monitoring', 'Service observability', 'Release validation'],
    problems: ['model release reliability', 'training reproducibility', 'Arabic service monitoring', 'inference cost analysis', 'feature pipeline validation'],
    work: 'standardised model packaging, release checks, and monitoring for small cross-functional AI teams',
    project: 'Model release and monitoring toolkit', research: 'Practical checks for reliable machine learning releases' },
  { layout: 'technical', field: 'generative AI', company: 'Fikra Applied Intelligence',
    roles: ['Generative AI Engineer', 'LLM Engineer', 'RAG Engineer', 'AI Agent Engineer', 'LLM Evaluation Engineer'],
    tools: ['Python', 'Transformers', 'FastAPI', 'pgvector', 'PyTorch'],
    methods: ['Retrieval evaluation', 'Grounded generation', 'Tool use', 'Prompt testing', 'Failure analysis'],
    problems: ['bilingual policy search', 'Arabic knowledge assistance', 'document-grounded answers', 'tool-assisted service workflows', 'retrieval quality measurement'],
    work: 'built grounded generation workflows with traceable sources, controlled tool access, and repeatable evaluations',
    project: 'Bilingual retrieval evaluation suite', research: 'Measuring answer grounding in Arabic retrieval systems' },
  { layout: 'academic', field: 'AI research', company: 'Nile Applied Research Group',
    roles: ['AI Researcher', 'AI Research Assistant', 'Machine Learning Researcher', 'NLP Research Scientist', 'Computer Vision Researcher'],
    tools: ['Python', 'PyTorch', 'NumPy', 'LaTeX', 'Git'],
    methods: ['Experimental design', 'Ablation studies', 'Reproducibility', 'Statistical analysis', 'Literature review'],
    problems: ['Arabic language evaluation', 'machine unlearning', 'low-resource modelling', 'representation learning', 'robustness under distribution shift'],
    work: 'designed controlled experiments, documented assumptions, and connected findings to prior literature',
    project: 'Reproducible AI experiment archive', research: 'Evaluation protocols for low-resource machine learning' },
  { layout: 'academic', field: 'AI education', company: 'Delta Computing Teaching Lab',
    roles: ['Teaching Assistant — AI', 'Machine Learning Teaching Assistant', 'Deep Learning Teaching Assistant', 'NLP Teaching Assistant', 'Computer Vision Teaching Assistant'],
    tools: ['Python', 'Jupyter', 'PyTorch', 'scikit-learn', 'LaTeX'],
    methods: ['Lab instruction', 'Assessment design', 'Student mentoring', 'Experiment design', 'Technical writing'],
    problems: ['introductory machine learning labs', 'Arabic text analysis coursework', 'deep learning practicals', 'responsible model evaluation', 'computer vision capstone projects'],
    work: 'led practical classes that connected mathematical foundations to tested, reproducible implementations',
    project: 'Open machine learning practicals', research: 'Teaching reproducible evaluation through practical AI coursework' },
  { layout: 'hybrid', field: 'AI product delivery', company: 'Hala Digital Products',
    roles: ['AI Product Manager', 'AI Business Analyst', 'AI Product Analyst', 'AI Implementation Specialist', 'AI Technical Consultant'],
    tools: ['SQL', 'Python', 'Power BI', 'Jira', 'Figma'],
    methods: ['Product discovery', 'Acceptance criteria', 'Evaluation planning', 'Stakeholder workshops', 'Rollout analysis'],
    problems: ['Arabic self-service journeys', 'retail decision support', 'support workflow redesign', 'AI feature adoption', 'human review processes'],
    work: 'translated operational needs into scoped AI features, evaluation plans, and clear delivery milestones',
    project: 'AI-assisted support discovery study', research: 'Human review and acceptance criteria for applied AI products' },
  { layout: 'chronological', field: 'robotics and edge AI', company: 'Haraka Intelligent Systems',
    roles: ['Robotics AI Engineer', 'Edge AI Engineer', 'Autonomous Systems Engineer', 'Robot Perception Engineer', 'Embedded ML Engineer'],
    tools: ['Python', 'C++', 'ROS 2', 'OpenCV', 'ONNX'],
    methods: ['Sensor fusion', 'Perception testing', 'Simulation', 'Latency profiling', 'Hardware integration'],
    problems: ['warehouse robot perception', 'edge visual inspection', 'indoor navigation', 'sensor-based anomaly detection', 'low-power inference'],
    work: 'connected perception models to simulated and physical systems with careful timing and failure checks',
    project: 'Indoor robot perception prototype', research: 'Evaluating perception reliability in constrained environments' },
];

function makeCv(domain, variation, i) {
  const name = names[i], focus = domain.problems[variation], university = universities[variation];
  const title = domain.roles[variation];
  const mainBullets = [
    `Led practical work on ${focus}; ${domain.work}, coordinating requirements with engineering colleagues and documenting the decisions behind each iteration.`,
    `Prepared representative datasets from consented or public sources, checked missing values and duplicated records, and recorded clear inclusion rules before any training or evaluation began.`,
    `Compared alternative approaches using held-out examples, repeatable scripts, and agreed acceptance criteria; investigated difficult cases rather than relying on a single headline performance measure.`,
    `Worked with Arabic and English content where relevant, checking regional terminology, uneven input quality, and the operational context of teams serving customers across Egypt.`,
    `Packaged the work with versioned configuration, readable documentation, and automated checks so colleagues could reproduce results, review changes, and maintain the system after handover.`,
    `Presented findings in weekly reviews, explained limitations to non-specialist stakeholders, and translated feedback into a prioritised list of improvements for the next delivery cycle.`,
  ];
  const earlierBullets = [
    `Supported a multidisciplinary team investigating ${domain.problems[(variation + 1) % 5]}, turning loosely defined questions into small, testable tasks with clear inputs and expected outcomes.`,
    `Built reusable analysis notebooks and data checks, reviewed results with a mentor, and kept a shared record of assumptions, experiments, and unresolved questions.`,
    `Collaborated on code reviews and test cases, using small pull requests and written explanations to keep changes understandable for teammates with different technical backgrounds.`,
    `Prepared concise progress reports that connected technical findings to service quality, implementation effort, and the needs of the people expected to use the result.`,
    `Maintained a structured handover archive containing setup instructions, sample inputs, evaluation scripts, and known limitations, helping new team members continue the work independently.`,
  ];
  const cv = {
    name, title,
    layout: { recommended: domain.layout },
    contact: { email: `${name.toLowerCase().replaceAll(' ', '.')}@example.com`, phone: '+20 100 000 0000', location: cities[variation] },
    summary: `${title} focused on ${focus} and practical ${domain.field}. Experienced in moving from a clearly defined problem to a documented, evaluated solution, with careful attention to data quality and reproducibility. Collaborates with technical and operational teams, communicates limitations clearly, and brings an Arabic-English perspective to products and research serving users across Egypt and the wider region.`,
    skills: [
      { category: 'Tools & platforms', items: domain.tools },
      { category: 'Specialist practice', items: domain.methods },
      { category: 'Delivery & communication', items: ['Technical documentation', 'Code review', 'Cross-functional collaboration', 'Arabic', 'English'] },
    ],
    experience: [
      { role: title, company: domain.company, dates: '2023 – Present', kind: domain.layout === 'academic' ? (i >= 35 ? 'teaching' : 'research') : 'industry', bullets: mainBullets },
      { role: domain.layout === 'academic' ? 'Graduate Research Assistant' : 'Junior ' + domain.roles[0], company: domain.layout === 'academic' ? university : 'Delta Digital Lab', dates: '2021 – 2023', kind: domain.layout === 'academic' ? 'research' : 'industry', bullets: earlierBullets },
    ],
    projects: Array.from({length: 4}, (_, j) => ({
      title: j === 0 ? domain.project : `${domain.problems[(variation + j) % 5].replace(/^./, c => c.toUpperCase())} study`,
      tech: domain.tools.slice(j % 2, j % 2 + 3).join(', '),
      description: `Developed a documented prototype exploring ${domain.problems[(variation + j) % 5]}. Defined the task, prepared representative examples, and compared a simple baseline with a more specialised approach. Included repeatable evaluation scripts, a review of failure cases, and setup instructions. Presented the findings alongside practical limits and next steps, with attention to regional context and Arabic-English inputs where applicable.`,
    })),
    education: [
      { degree: domain.layout === 'academic' ? 'MSc, Computer Science — Artificial Intelligence' : 'BSc, Computer Science and Engineering', institution: university, dates: domain.layout === 'academic' ? '2021 – 2023' : '2017 – 2021', details: `Focus: ${domain.field}. Completed coursework in statistics, algorithms, machine learning, and software engineering. Capstone: ${domain.project.toLowerCase()}, with a written evaluation and reproducible implementation.` },
    ],
    certifications: ['Professional development: practical machine learning, reproducible experimentation, and technical communication workshops.'],
    layoutProfiles: {
      hybrid: { title, summary: `Combines ${domain.methods.slice(0, 3).join(', ').toLowerCase()} with hands-on experience in ${focus}. Brings structured delivery, evidence-led decisions, and clear communication to multidisciplinary AI teams.` },
      technical: { title },
    },
  };
  if (domain.layout === 'hybrid') {
    cv.experience.push(
      { role: 'AI Delivery Intern', company: 'Delta Digital Lab', dates: '2020 – 2021', kind: 'industry', bullets: [
        `Supported a supervised pilot for ${focus}, gathering user questions, recording decisions, and helping the team connect the proposed solution to a clearly defined operational need.`,
        'Prepared demonstration datasets and walkthroughs for internal reviews, checked examples for missing context, and incorporated feedback into clearer documentation for the next group of reviewers.',
        'Maintained a shared backlog of open issues and acceptance checks, worked with mentors to prioritise small changes, and documented the evidence used to decide whether work was ready.',
      ] },
      { role: 'Data Analysis Intern', company: 'Fikra Student Innovation Lab', dates: '2019 – 2020', kind: 'industry', bullets: [
        'Cleaned public datasets for a student-led analysis project, wrote repeatable preparation steps, and explained data limitations in a short report shared with the supervising team.',
        'Created simple reporting views and checked results against source records, helping classmates identify inconsistent definitions and agree on a common set of measures before presenting findings.',
        'Presented an end-of-placement demonstration with reproducible notebooks, a summary of lessons learned, and a practical handover guide for the students continuing the project.',
      ] },
    );
  }
  if (domain.layout === 'academic') {
    cv.publications = [
      `${name}. ${domain.research}. Departmental research report, 2024.`,
      `${name} and collaborators. Reproducible experiments for ${focus}. Internal workshop poster, 2023.`,
      `${name}. Error analysis and evaluation notes for ${domain.field}. Graduate research working paper, 2022.`,
    ];
    cv.awards = ['Departmental recognition for collaborative project work, 2023.', 'Student research presentation commendation, 2022.'];
  }
  return cv;
}

export const profiles = domains.flatMap((domain, d) => domain.roles.map((title, v) => {
  const i = d * 5 + v;
  return { id: `ai-${String(i + 1).padStart(2, '0')}`, name: names[i], title, gender: i % 2 === 0 ? 'woman' : 'man', layout: domain.layout, cv: makeCv(domain, v, i) };
}));

// A shuffled deck gives every profile a turn in a fresh random order, without
// adjacent repeats across deck boundaries. It never follows catalogue order.
export function createProfileDeck(random = Math.random) {
  let remaining = [], previous = null;
  return () => {
    if (!remaining.length) {
      remaining = [...profiles];
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      if (remaining.at(-1)?.id === previous) [remaining[0], remaining[remaining.length - 1]] = [remaining.at(-1), remaining[0]];
    }
    const next = remaining.pop(); previous = next.id; return next;
  };
}
let active = profiles[0];
export function setActiveProfile(id) { active = profiles.find(p => p.id === id) || active; }
export function getActiveExample() { return JSON.parse(JSON.stringify(active.cv)); }
