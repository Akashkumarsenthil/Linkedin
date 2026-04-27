export interface Job {
  id: number
  title: string
  company: string
  companyLogo: string // single uppercase letter
  location: string
  workMode: 'Hybrid' | 'On-site' | 'Remote'
  employmentType: 'Full-time' | 'Part-time' | 'Contract' | 'Internship'
  postedDate: string
  promoted: boolean
  alumniLine: string
  applicantCount: number
  clickedApplyCount: number
  salaryRange: string
  aboutTheJob: string
  responsibilities: string[]
  requiredSkills: string[]
  qualifications: string[]
  aboutTheCompany: string
}

export const SAMPLE_JOBS: Job[] = [
  {
    id: 1,
    title: 'Senior Frontend Engineer',
    company: 'Google',
    companyLogo: 'G',
    location: 'Mountain View, CA',
    workMode: 'Hybrid',
    employmentType: 'Full-time',
    postedDate: '2 days ago',
    promoted: true,
    alumniLine: '3 alumni work here · 12 connections',
    applicantCount: 287,
    clickedApplyCount: 1420,
    salaryRange: '$180,000 - $260,000/yr',
    aboutTheJob:
      'We are looking for a Senior Frontend Engineer to join our Google Cloud team. You will work on building next-generation web experiences that help millions of developers build and deploy applications. This is an exciting opportunity to shape the future of cloud computing interfaces.',
    responsibilities: [
      'Design, develop, and maintain high-quality frontend applications using React and TypeScript',
      'Collaborate with UX designers and product managers to deliver exceptional user experiences',
      'Mentor junior engineers and conduct code reviews',
      'Optimize application performance and ensure cross-browser compatibility',
      'Contribute to architectural decisions and technical strategy',
    ],
    requiredSkills: ['React', 'TypeScript', 'CSS', 'GraphQL', 'Node.js', 'Web Performance'],
    qualifications: [
      "Bachelor's degree in Computer Science or equivalent experience",
      '5+ years of frontend development experience',
      'Strong proficiency in React, TypeScript, and modern CSS',
      'Experience with large-scale web applications',
      'Excellent communication and collaboration skills',
    ],
    aboutTheCompany:
      'Google LLC is an American multinational technology company focusing on artificial intelligence, online advertising, search engine technology, cloud computing, computer software, quantum computing, e-commerce, and consumer electronics. It has been referred to as the most powerful company in the world.',
  },
  {
    id: 2,
    title: 'Data Scientist',
    company: 'Meta',
    companyLogo: 'M',
    location: 'Menlo Park, CA',
    workMode: 'On-site',
    employmentType: 'Full-time',
    postedDate: '5 hours ago',
    promoted: false,
    alumniLine: '8 alumni work here · 24 connections',
    applicantCount: 156,
    clickedApplyCount: 890,
    salaryRange: '$160,000 - $230,000/yr',
    aboutTheJob:
      'Meta is seeking a talented Data Scientist to join our Ads Ranking team. You will leverage massive datasets to derive insights that directly impact billions of users. This role combines statistical analysis, machine learning, and product thinking.',
    responsibilities: [
      'Analyze large-scale datasets to identify trends and opportunities',
      'Build and deploy machine learning models for ad ranking optimization',
      'Design and analyze A/B tests to measure feature impact',
      'Present findings to senior leadership and cross-functional teams',
      'Develop data pipelines and dashboards for monitoring key metrics',
    ],
    requiredSkills: ['Python', 'SQL', 'Machine Learning', 'Statistics', 'TensorFlow', 'A/B Testing'],
    qualifications: [
      "Master's or PhD in Statistics, Computer Science, or related field",
      '3+ years of industry experience in data science',
      'Expert proficiency in Python and SQL',
      'Experience with deep learning frameworks',
      'Strong analytical and problem-solving skills',
    ],
    aboutTheCompany:
      'Meta Platforms, Inc. develops products that enable people to connect and share through mobile devices, personal computers, virtual reality headsets, and wearables. The company operates Facebook, Instagram, Messenger, WhatsApp, and Meta Quest.',
  },
  {
    id: 3,
    title: 'Product Manager, Enterprise',
    company: 'Microsoft',
    companyLogo: 'M',
    location: 'Redmond, WA',
    workMode: 'Hybrid',
    employmentType: 'Full-time',
    postedDate: '1 week ago',
    promoted: false,
    alumniLine: '15 alumni work here · 42 connections',
    applicantCount: 423,
    clickedApplyCount: 2100,
    salaryRange: '$150,000 - $220,000/yr',
    aboutTheJob:
      'Join Microsoft as a Product Manager for our Enterprise suite. You will drive the product vision and roadmap for tools used by millions of professionals worldwide. This is a high-impact role at the intersection of technology and business strategy.',
    responsibilities: [
      'Define and execute product roadmap aligned with business objectives',
      'Gather and prioritize customer requirements through research and feedback',
      'Work closely with engineering teams to deliver features on schedule',
      'Analyze product metrics and drive data-informed decisions',
      'Communicate product strategy to stakeholders at all levels',
    ],
    requiredSkills: ['Product Strategy', 'Agile', 'Data Analysis', 'User Research', 'Roadmapping'],
    qualifications: [
      "Bachelor's degree in Business, Engineering, or related field",
      '5+ years of product management experience',
      'Track record of shipping successful enterprise products',
      'Strong analytical and communication skills',
      'MBA preferred but not required',
    ],
    aboutTheCompany:
      'Microsoft Corporation develops and supports software, services, devices, and solutions worldwide. The company operates through Productivity and Business Processes, Intelligent Cloud, and More Personal Computing segments.',
  },
  {
    id: 4,
    title: 'Backend Engineer (Python)',
    company: 'Netflix',
    companyLogo: 'N',
    location: 'Los Gatos, CA',
    workMode: 'Remote',
    employmentType: 'Full-time',
    postedDate: '3 days ago',
    promoted: true,
    alumniLine: '2 alumni work here · 7 connections',
    applicantCount: 198,
    clickedApplyCount: 1050,
    salaryRange: '$200,000 - $340,000/yr',
    aboutTheJob:
      'Netflix is looking for a Backend Engineer to help build and scale our content delivery and personalization platform. You will work on systems that serve 200+ million subscribers worldwide, tackling complex distributed systems challenges.',
    responsibilities: [
      'Design and implement scalable backend services using Python and Java',
      'Build APIs and microservices for content discovery and recommendations',
      'Ensure high availability and performance of critical systems',
      'Collaborate with data engineering teams on real-time data pipelines',
      'Participate in on-call rotations and incident response',
    ],
    requiredSkills: ['Python', 'Java', 'AWS', 'Microservices', 'Distributed Systems', 'Kafka'],
    qualifications: [
      "Bachelor's degree in Computer Science or equivalent",
      '4+ years of backend development experience',
      'Strong experience with Python and/or Java',
      'Knowledge of cloud infrastructure (AWS preferred)',
      'Experience with distributed systems at scale',
    ],
    aboutTheCompany:
      'Netflix, Inc. is an American subscription video on-demand streaming service. The company offers films and television series from various genres, and is available in multiple languages, in over 190 countries.',
  },
  {
    id: 5,
    title: 'UX Designer',
    company: 'Apple',
    companyLogo: 'A',
    location: 'Cupertino, CA',
    workMode: 'On-site',
    employmentType: 'Full-time',
    postedDate: '1 day ago',
    promoted: false,
    alumniLine: '6 alumni work here · 18 connections',
    applicantCount: 312,
    clickedApplyCount: 1680,
    salaryRange: '$140,000 - $210,000/yr',
    aboutTheJob:
      'Apple is seeking a UX Designer to create intuitive and beautiful interfaces for our next-generation products. You will collaborate with world-class designers and engineers to craft experiences that delight millions of users across the globe.',
    responsibilities: [
      'Create wireframes, prototypes, and high-fidelity designs for iOS and macOS',
      'Conduct user research and usability testing',
      'Collaborate with engineering teams to ensure pixel-perfect implementation',
      'Define and maintain design systems and component libraries',
      'Stay current with design trends and platform guidelines',
    ],
    requiredSkills: ['Figma', 'Sketch', 'Prototyping', 'User Research', 'Design Systems', 'iOS Design'],
    qualifications: [
      "Bachelor's degree in Design, HCI, or related field",
      '3+ years of UX/UI design experience',
      'Strong portfolio demonstrating end-to-end design process',
      'Experience designing for mobile and desktop platforms',
      'Excellent visual design skills and attention to detail',
    ],
    aboutTheCompany:
      'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide. Apple is one of the Big Five American information technology companies alongside Alphabet, Amazon, Meta, and Microsoft.',
  },
  {
    id: 6,
    title: 'DevOps Engineer',
    company: 'Amazon',
    companyLogo: 'A',
    location: 'Seattle, WA',
    workMode: 'Hybrid',
    employmentType: 'Full-time',
    postedDate: '4 days ago',
    promoted: false,
    alumniLine: '21 alumni work here · 55 connections',
    applicantCount: 89,
    clickedApplyCount: 540,
    salaryRange: '$150,000 - $230,000/yr',
    aboutTheJob:
      'Amazon Web Services (AWS) is hiring a DevOps Engineer to help automate and optimize our cloud infrastructure. You will be part of a team that manages the world\'s largest cloud platform, ensuring reliability and performance for millions of customers.',
    responsibilities: [
      'Design and implement CI/CD pipelines for microservices deployments',
      'Manage and optimize Kubernetes clusters and container orchestration',
      'Automate infrastructure provisioning using Terraform and CloudFormation',
      'Monitor system health and respond to production incidents',
      'Implement security best practices across the deployment pipeline',
    ],
    requiredSkills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux'],
    qualifications: [
      "Bachelor's degree in Computer Science or related field",
      '3+ years of DevOps or SRE experience',
      'Deep expertise with AWS services',
      'Strong scripting skills (Python, Bash)',
      'Experience with container orchestration at scale',
    ],
    aboutTheCompany:
      'Amazon.com, Inc. is an American multinational technology company engaged in e-commerce, cloud computing, online advertising, digital streaming, and artificial intelligence. Amazon Web Services (AWS) is the world\'s most comprehensive and widely adopted cloud platform.',
  },
  {
    id: 7,
    title: 'Machine Learning Engineer',
    company: 'OpenAI',
    companyLogo: 'O',
    location: 'San Francisco, CA',
    workMode: 'On-site',
    employmentType: 'Full-time',
    postedDate: '6 hours ago',
    promoted: true,
    alumniLine: '1 alumni works here · 5 connections',
    applicantCount: 567,
    clickedApplyCount: 3200,
    salaryRange: '$250,000 - $400,000/yr',
    aboutTheJob:
      'OpenAI is looking for a Machine Learning Engineer to push the boundaries of AI research and deployment. You will work alongside leading researchers to build systems that are safe, beneficial, and capable of solving complex real-world problems.',
    responsibilities: [
      'Train and fine-tune large language models at scale',
      'Develop novel ML techniques for improving model performance and safety',
      'Build infrastructure for efficient model training and serving',
      'Collaborate with research scientists on experimental designs',
      'Contribute to open-source AI tools and frameworks',
    ],
    requiredSkills: ['PyTorch', 'Python', 'Distributed Training', 'NLP', 'GPU Computing', 'Transformers'],
    qualifications: [
      "Master's or PhD in Machine Learning, AI, or related field",
      '3+ years of ML engineering experience',
      'Published research in top-tier AI conferences preferred',
      'Strong proficiency in PyTorch or TensorFlow',
      'Experience with large-scale distributed computing',
    ],
    aboutTheCompany:
      'OpenAI is an AI research and deployment company. Our mission is to ensure that artificial general intelligence benefits all of humanity. We build and deploy advanced AI systems including GPT-4, DALL·E, and ChatGPT.',
  },
  {
    id: 8,
    title: 'Full Stack Developer',
    company: 'Stripe',
    companyLogo: 'S',
    location: 'San Francisco, CA',
    workMode: 'Remote',
    employmentType: 'Full-time',
    postedDate: '2 weeks ago',
    promoted: false,
    alumniLine: '4 alumni work here · 11 connections',
    applicantCount: 234,
    clickedApplyCount: 1150,
    salaryRange: '$170,000 - $250,000/yr',
    aboutTheJob:
      'Stripe is hiring a Full Stack Developer to build and improve our payment infrastructure dashboard. You will work on tools used by millions of businesses to manage payments, subscriptions, and financial operations.',
    responsibilities: [
      'Build responsive web applications using React and Ruby on Rails',
      'Design and implement RESTful APIs and webhook systems',
      'Write comprehensive tests and maintain high code quality',
      'Optimize database queries and application performance',
      'Participate in architecture reviews and design discussions',
    ],
    requiredSkills: ['React', 'Ruby', 'PostgreSQL', 'REST APIs', 'TypeScript', 'Redis'],
    qualifications: [
      "Bachelor's degree in Computer Science or equivalent",
      '3+ years of full-stack development experience',
      'Proficiency in React and a backend language',
      'Experience with payment systems or fintech preferred',
      'Strong understanding of web security principles',
    ],
    aboutTheCompany:
      'Stripe is a financial infrastructure platform for businesses. Millions of companies—from the world\'s largest enterprises to the most ambitious startups—use Stripe to accept payments, grow their revenue, and accelerate new business opportunities.',
  },
  {
    id: 9,
    title: 'Cloud Solutions Architect',
    company: 'Salesforce',
    companyLogo: 'S',
    location: 'Indianapolis, IN',
    workMode: 'Remote',
    employmentType: 'Full-time',
    postedDate: '3 days ago',
    promoted: false,
    alumniLine: '10 alumni work here · 30 connections',
    applicantCount: 142,
    clickedApplyCount: 780,
    salaryRange: '$160,000 - $240,000/yr',
    aboutTheJob:
      'Salesforce is seeking a Cloud Solutions Architect to help enterprise customers design and implement scalable cloud solutions. You will be the trusted technical advisor guiding digital transformation journeys.',
    responsibilities: [
      'Design end-to-end cloud architecture solutions for enterprise clients',
      'Conduct technical workshops and proof-of-concept demonstrations',
      'Collaborate with sales teams to develop technical proposals',
      'Stay current with cloud technologies and industry trends',
      'Mentor engineering teams on best practices and patterns',
    ],
    requiredSkills: ['Cloud Architecture', 'Salesforce', 'Integration', 'API Design', 'Enterprise Software'],
    qualifications: [
      "Bachelor's degree in Computer Science or related field",
      '7+ years of software engineering or architecture experience',
      'Salesforce certifications (Platform Developer, Architect preferred)',
      'Experience with enterprise integration patterns',
      'Excellent presentation and client-facing skills',
    ],
    aboutTheCompany:
      'Salesforce, Inc. is an American cloud-based software company headquartered in San Francisco. It provides customer relationship management (CRM) technology and enterprise cloud computing solutions.',
  },
  {
    id: 10,
    title: 'iOS Developer',
    company: 'Spotify',
    companyLogo: 'S',
    location: 'New York, NY',
    workMode: 'Hybrid',
    employmentType: 'Full-time',
    postedDate: '1 week ago',
    promoted: false,
    alumniLine: '5 alumni work here · 16 connections',
    applicantCount: 178,
    clickedApplyCount: 920,
    salaryRange: '$145,000 - $210,000/yr',
    aboutTheJob:
      'Spotify is looking for an iOS Developer to build and enhance the world\'s most popular music streaming app. You will work on features used by 500+ million users, focusing on performance, accessibility, and user delight.',
    responsibilities: [
      'Develop and maintain features for the Spotify iOS app using Swift',
      'Implement responsive and accessible user interfaces',
      'Write unit and integration tests for robust code quality',
      'Collaborate with backend teams on API integration',
      'Optimize app performance and battery consumption',
    ],
    requiredSkills: ['Swift', 'UIKit', 'SwiftUI', 'Core Data', 'CI/CD', 'Accessibility'],
    qualifications: [
      "Bachelor's degree in Computer Science or equivalent",
      '3+ years of iOS development experience with Swift',
      'Experience with app architecture patterns (MVVM, VIPER)',
      'Published apps on the App Store',
      'Knowledge of audio/media frameworks is a plus',
    ],
    aboutTheCompany:
      'Spotify is a digital music, podcast, and video service that gives you access to millions of songs and other content from creators all over the world. Spotify is the world\'s most popular audio streaming subscription service.',
  },
]
