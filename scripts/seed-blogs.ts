import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const SAMPLE_BLOGS = [
  {
    slug: 'science-of-clean-Energy Drinks-nootropics',
    title: 'The Science of Clean Energy Drinks: Why Traditional Energy Drinks Crash and How Nootropics Redefine Focus',
    excerpt: 'Explore how neurotransmitter signaling, zero refined sugars, and precision nootropic stacks deliver sustained cognitive drive without the dreaded 2 PM crash.',
    coverImage: '/brand/APEX.webp',
    author: 'Dr. Marcus Vance',
    authorRole: 'Head of Bio-Nutrient Formulation',
    authorAvatar: '/brand/panther_white_icon-transparent.webp',
    category: 'Energy & Science',
    tags: ['Energy Drinks', 'Nootropics', 'Clean Caffeine', 'Cognitive Focus'],
    readTime: '5 min read',
    isPublished: true,
    featured: true,
    metaTitle: 'The Science of Clean Energy Drinks | REBELIVE Labs',
    metaDesc: 'Discover the neuro-biochemical mechanisms of clean caffeine paired with L-theanine and adaptogenic electrolytes.',
    content: `
<h2>The Crash Dilemma: Deconstructing Old-Guard Energy</h2>
<p>For more than two decades, the global energy drink market has been dominated by a singular, fundamentally flawed formulation: hyper-concentrated synthetic caffeine dissolved in up to 30 grams of high-fructose corn syrup or refined sugars. While this triggers an immediate surge of blood glucose and epinephrine, the physiological cost is catastrophic.</p>

<p>When high doses of sugar flood the bloodstream, your pancreas pumps out a massive wave of insulin to clear the excess glucose. The resultant rebound hypoglycemia—colloquially termed the <strong>"2 PM Crash"</strong>—leaves your brain starving for metabolic fuel, causing brain fog, jitteriness, and acute fatigue.</p>

<div class="my-6 rounded-xl border border-white/20 bg-white/[0.04] p-5">
  <p class="text-white/90 italic font-mono text-sm leading-relaxed">
    "True vitality is not about red-lining your nervous system. It is about supporting cellular ATP synthesis and maintaining smooth neurotransmitter signaling."
  </p>
  <span class="block text-xs font-mono text-white/50 mt-2">— REBELIVE Biochemical Research Paper #04</span>
</div>

<h2>Enter Precision Energy Drinks: The Nootropic Matrix</h2>
<p>At <strong>REBELIVE</strong>, we set out to construct an alternative from first principles. Rather than shocking the adrenal glands with synthetic stimulants, our formula utilizes a synergistic ratio of natural caffeine, purified L-Theanine, and functional B-vitamin complexes.</p>

<img src="/brand/science-backed-bg.webp" alt="Clean Energy Drinks Scientific Formulation" class="w-full rounded-2xl my-6 border border-white/10 shadow-2xl" />

<h3>1. Adenosine Receptor Antagonism Without the Tremors</h3>
<p>Natural caffeine acts by competitively binding to adenosine A1 and A2A receptors in the central nervous system. When coupled with L-Theanine—an amino acid derived from high-grade green tea—it promotes alpha brain-wave activity (8–12 Hz), which is neuro-electrically linked to a state of <em>relaxed alertness</em> and deep flow state.</p>

<h3>2. Cellular Hydration & Electrolytic Conductivity</h3>
<p>Cognitive endurance degrades by up to 25% with as little as a 1.5% drop in cellular hydration. Our beverage incorporates bio-available ionic sodium, potassium, and magnesium salts that preserve cellular osmotic pressure and optimize peripheral nerve transmission during high-intensity cognitive output.</p>

<ul>
  <li><strong>Zero Sugar Formulation:</strong> Eliminates rebound glycemic drops and systemic inflammation.</li>
  <li><strong>Sustained Plasma Curves:</strong> Natural caffeine absorption is smoothed over a 4 to 6 hour plateau.</li>
  <li><strong>Clean Aftertaste:</strong> Crafted with crisp botanicals and zero artificial chemical residue.</li>
</ul>

<h2>The Modern Rebel's Ritual</h2>
<p>Whether you're breaking personal records in the training room or architecting mission-critical code at midnight, biological stamina requires intelligent fueling. The era of jittery synthetic energy is over. Welcome to clean Energy Drinks.</p>
    `.trim(),
  },
  {
    slug: 'cellular-hydration-electrolytes-endurance',
    title: 'Hydration at the Cellular Level: The Critical Role of Electrolytes in High-Performance Living',
    excerpt: 'Why drinking plain water isn’t enough when pushing your boundaries. How ionic osmolytes maintain neuromuscular velocity.',
    coverImage: '/brand/Aviva.webp',
    author: 'Elena Rostova',
    authorRole: 'Director of Performance Athletics',
    authorAvatar: '/brand/panther_white_icon-transparent.webp',
    category: 'Nutrition',
    tags: ['Hydration', 'Electrolytes', 'Nutrition', 'Performance', 'Endurance'],
    readTime: '4 min read',
    isPublished: true,
    featured: false,
    metaTitle: 'Hydration at the Cellular Level | REBELIVE',
    metaDesc: 'Understand the osmotic physiology of sodium-potassium pumps and why pure water alone fails high-output performers.',
    content: `
<h2>Why Drinking Plain Water Is Only Half the Equation</h2>
<p>We are told from childhood to drink eight glasses of water a day. Yet endurance athletes, high-output executives, and relentless creators frequently report afternoon sluggishness and persistent headaches despite guzzling liters of purified water.</p>

<p>The explanation lies in a physiological reality: <strong>hyponatremic dilution</strong>. When you sweat or expend heavy mental energy, you do not simply lose H2O—you excrete critical electrolytes including sodium ($Na^+$), potassium ($K^+$), and magnesium ($Mg^{2+}$). Flooding your extracellular fluid with hypotonic distilled water further dilutes these mineral ions, stalling your cellular pumps.</p>

<img src="/brand/Aviva.webp" alt="Aviva Electrolyte & Clean Citrus Can" class="w-full max-w-md mx-auto rounded-2xl my-6 border border-white/10 shadow-2xl" />

<h2>The Sodium-Potassium ATPase Engine</h2>
<p>Every single neuron in your cerebral cortex and every muscle fiber in your quadriceps relies on the <strong>sodium-potassium pump</strong> to generate electrical action potentials. Without adequate extracellular sodium, nerve impulses travel at a fraction of their optimal speed.</p>

<blockquote>
  "Hydration is not measured by the volume of liquid in your stomach; it is measured by the mineral osmolarity inside your cellular membranes."
</blockquote>

<h3>Key Mineral Co-Factors in REBELIVE:</h3>
<ul>
  <li><strong>Ionic Sodium:</strong> Regulates extracellular fluid volume and prevents muscle cramps.</li>
  <li><strong>Potassium Citrate:</strong> Buffers metabolic acidity and facilitates smooth cardiac rhythm.</li>
  <li><strong>Chelated Magnesium:</strong> Vital for over 300 enzymatic reactions, including direct ATP synthesis.</li>
</ul>

<p>By engineering our beverages with calculated osmotic concentrations, fluid transfers across the intestinal lumen into the bloodstream with near-zero gastric transit delay, keeping you fueled from sunrise to the late-night push.</p>
    `.trim(),
  },
  {
    slug: 'circadian-caffeine-timing-for-peak-clarity',
    title: 'The Circadian Protocol: Precision Caffeine Timing for Peak Clarity Without Disrupting Deep Sleep',
    excerpt: 'Master the half-life of methylxanthines. Learn when to dose clean caffeine to synchronize with your body’s cortisol curve.',
    coverImage: '/brand/Capella.webp',
    author: 'Kaelen Thorne',
    authorRole: 'Sleep & Human Optimization Specialist',
    authorAvatar: '/brand/panther_white_icon-transparent.webp',
    category: 'Mind & Focus',
    tags: ['Caffeine Timing', 'Circadian Rhythm', 'Mind & Focus', 'Deep Sleep', 'Focus'],
    readTime: '4 min read',
    isPublished: true,
    featured: false,
    metaTitle: 'Caffeine Timing & Circadian Rhythms | REBELIVE',
    metaDesc: 'How to maximize caffeine efficacy by delaying your morning intake and respecting methylxanthine clearance half-life.',
    content: `
<h2>The 90-Minute Morning Golden Window</h2>
<p>Most people stumble out of bed and immediately reach for a stimulant. Neurobiologists now know that this instinctive ritual actively sabotages your energy levels later in the afternoon.</p>

<p>When you awaken, your body experiences a natural surge in cortisol known as the <strong>Cortisol Awakening Response (CAR)</strong>. This hormonal pulse clears remaining sleep inertia and initiates metabolic wakefulness. Consuming caffeine during the height of your CAR blunts cortisol's natural spike, increases stimulant tolerance, and leaves residual adenosine unconquered.</p>

<div class="my-6 rounded-xl border border-white/20 bg-white/[0.04] p-5">
  <h4 class="text-white font-bold text-base mb-2">The Optimal 90-Minute Rule</h4>
  <p class="text-white/80 text-sm leading-relaxed">
    Delay your first caffeine intake by 90 to 120 minutes post-waking. This allows your adenosine receptors to naturally clear endogenous adenosine buildup from sleep before competitive antagonism begins.
  </p>
</div>

<h2>Understanding Caffeine Clearance Half-Life</h2>
<p>The metabolic half-life of caffeine averages between 5 to 7 hours in healthy adults. That means if you drink 150mg of caffeine at 4:00 PM, approximately 75mg remains active in your bloodstream at 10:00 PM—interfering with slow-wave delta sleep and restorative REM phases.</p>

<img src="/brand/Capella.webp" alt="Capella Electric Energy Drinks Can" class="w-full max-w-md mx-auto rounded-2xl my-6 border border-white/10 shadow-2xl" />

<h2>The REBELIVE Framework:</h2>
<ul>
  <li><strong>First Can:</strong> 10:00 AM – 11:30 AM (Peak morning cognitive workload).</li>
  <li><strong>Midday Renewal:</strong> 1:30 PM – 2:30 PM (Pre-training or afternoon complex strategic planning).</li>
  <li><strong>Stimulant Cutoff:</strong> 3:00 PM – Ensure full clearance before nightfall.</li>
</ul>

<p>Respect your biology, and your biology will reward you with tireless mental velocity and unbroken sleep.</p>
    `.trim(),
  },
  {
    slug: 'microbiome-axis-gut-health-and-athletic-drive',
    title: 'The Gut-Brain Axis: How Microbiome Health Directs Daily Cognitive Drive and Immunity',
    excerpt: 'Uncovering the biological cross-talk between beneficial intestinal flora and neurotransmitter production for sustained daytime vigor.',
    coverImage: '/brand/DSCF8117.webp',
    author: 'Dr. Soraya Lin',
    authorRole: 'Microbiome Researcher',
    authorAvatar: '/brand/panther_white_icon-transparent.webp',
    category: 'Gut Health',
    tags: ['Gut Health', 'Microbiome', 'Energy Drinks', 'Cognitive Drive', 'Immunity'],
    readTime: '5 min read',
    isPublished: true,
    featured: false,
    metaTitle: 'The Gut-Brain Axis & Everyday Performance | REBELIVE',
    metaDesc: 'Explore how microbiome equilibrium dictates systemic neurotransmitter balance and energy metabolism.',
    content: `
<h2>The Second Brain in Your Abdomen</h2>
<p>Over 90% of your body’s serotonin and roughly 50% of its dopamine are synthesized in the enteric nervous system, regulated directly by your gut microbiota. When your microbiome is assaulted by artificial sweeteners, emulsifiers, and processed additives, cellular inflammation triggers sluggish cognitive reflexes and systemic fatigue.</p>

<p>Clean formulation means honoring the digestive tract. By eliminating harsh synthetic dyes and chemical preservatives, REBELIVE protects your delicate gastrointestinal lining while providing cellular hydration that promotes smooth, steady nutrient absorption.</p>
    `.trim(),
  },
  {
    slug: 'the-rebel-mindset-defying-conventional-beverage-standards',
    title: 'The Rebel Mindset: Why We Refused to Conform to the Beverage Industry Playbook',
    excerpt: 'The story behind REBELIVE’s founding: ditching artificial dyes, cutting out the middlemen, and engineering what real performers demanded.',
    coverImage: '/brand/APEX.webp',
    author: 'Oxytrium Dynamics Founder',
    authorRole: 'Founding Team',
    authorAvatar: '/brand/panther_white_icon-transparent.webp',
    category: 'Rebel Mindset',
    tags: ['Rebel Mindset', 'Founders Story', 'Innovation', 'Zero Sugar'],
    readTime: '6 min read',
    isPublished: true,
    featured: false,
    metaTitle: 'The Rebel Mindset | REBELIVE Founders Story',
    metaDesc: 'Discover why REBELIVE was founded to disrupt the legacy chemical beverage monopoly.',
    content: `
<h2>The Legacy Beverage Monopoly Was Broken</h2>
<p>Look at the ingredients label on the typical supermarket shelf beverage. You will find artificial food coloring (Red 40, Yellow 5), chemical preservatives like sodium benzoate, synthetic sweeteners that upset the gut microbiome, and empty promises printed on metallic foil.</p>

<p>When we founded <strong>REBELIVE</strong> under the Oxytrium Dynamics banner, our mission wasn't to build another commodity can. It was to forge an uncompromising tool for creators, lifters, builders, and thinkers who demand pure biological leverage.</p>

<img src="/brand/DSCF8117.webp" alt="REBELIVE Founders Reviewing Formulation" class="w-full rounded-2xl my-6 border border-white/10 shadow-2xl" />

<h2>Formulated for Relentless Driven Lives</h2>
<p>We spent 18 months iterating through dozens of micro-batches in the laboratory. We evaluated nutrient bioavailability, tongue feel, carbonation bubble diameter, and thermal stability under extreme conditions.</p>

<blockquote>
  "If it didn't pass our own daily athletic and cognitive torture tests, it didn't leave the formulation bench. Good enough was never acceptable."
</blockquote>

<h3>Our Core Non-Negotiables:</h3>
<ul>
  <li><strong>Zero Sugar Forever:</strong> No corn syrup, no cane sugar, no artificial glycemic spikes.</li>
  <li><strong>Clean Label Transparency:</strong> Every milligram accounted for, with zero hidden proprietary blends.</li>
  <li><strong>Aesthetic Brutalism:</strong> Striking design language inspired by dark cybernetics and raw industrial minimalism.</li>
</ul>

<p>REBELIVE is not for everyone. It is for those who refuse complacency. Wake. Fuel. Rebel.</p>
    `.trim(),
  },
  {
    slug: 'inside-rebelive-origins-clean-label-engineering',
    title: 'Inside Rebelive: Formulating Clean High-Performance Energy from First Principles',
    excerpt: 'A behind-the-scenes look into our testing labs, ingredient sourcing protocols, and the relentless pursuit of zero-compromise fuel.',
    coverImage: '/brand/Capella.webp',
    author: 'Rebelive R&D Lab',
    authorRole: 'Product Architecture',
    authorAvatar: '/brand/panther_white_icon-transparent.webp',
    category: 'Inside Rebelive',
    tags: ['Inside Rebelive', 'Brand Story', 'Laboratory', 'Quality', 'Performance'],
    readTime: '5 min read',
    isPublished: true,
    featured: false,
    metaTitle: 'Inside Rebelive: Clean Label Engineering | REBELIVE',
    metaDesc: 'Take a look inside the Rebelive laboratory where clean energy science meets brutalist aesthetic standards.',
    content: `
<h2>Engineering from First Principles</h2>
<p>Most canned beverage brands outsource their formulation to white-label flavour houses that reuse identical sugary bases. At REBELIVE, every ingredient ratio was designed in-house from ground zero.</p>

<p>We systematically stress-tested active nootropics alongside ionic mineral salts to ensure that the mouthfeel, carbonation bite, and sustained cognitive boost delivered an unrivaled sensory and neuro-performance experience.</p>
    `.trim(),
  },
];

async function seed() {
  console.log('🌱 Starting BlogPost seed...');

  for (const item of SAMPLE_BLOGS) {
    const existing = await prisma.blogPost.findUnique({ where: { slug: item.slug } });
    if (existing) {
      console.log(`- Updating existing blog: ${item.slug}`);
      await prisma.blogPost.update({
        where: { slug: item.slug },
        data: item,
      });
    } else {
      console.log(`+ Creating new blog: ${item.slug}`);
      await prisma.blogPost.create({
        data: item,
      });
    }
  }

  const count = await prisma.blogPost.count();
  console.log(`✅ Seed finished! Total blogs in database: ${count}`);
}

seed()
  .catch((err) => {
    console.error('❌ Blog seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
