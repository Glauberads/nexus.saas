// =============================================
// LP SaaS — Premium JavaScript
// =============================================

document.addEventListener('DOMContentLoaded', () => {

  // === NAV SCROLL EFFECT ===
  const nav = document.getElementById('nav');
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // === INTERSECTION OBSERVER — REVEAL ON SCROLL ===
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .step-item, .system-card, .testi-card, .vault-item, .faq-item, .pain-item')
    .forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 0.08}s`;
      observer.observe(el);
    });

  // === STEP ITEMS ANIMATION ===
  const stepObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 150);
        stepObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.step-item').forEach(el => stepObserver.observe(el));

  // === FAQ ACCORDION ===
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      // Close all
      document.querySelectorAll('.faq-question').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.closest('.faq-item').querySelector('.faq-answer').classList.remove('open');
      });

      // Toggle current
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        answer.classList.add('open');
      }
    });
  });

  // === VAULT CATEGORY TABS ===
  const vaultCats = document.querySelectorAll('.vault-cat');
  const vaultGridItems = document.querySelectorAll('#vault-grid-main .vault-item');

  vaultCats.forEach(cat => {
    cat.addEventListener('click', () => {
      const selected = cat.dataset.cat;

      // Update active tab
      vaultCats.forEach(c => c.classList.remove('active'));
      cat.classList.add('active');

      // Filter items with animation
      vaultGridItems.forEach((item, idx) => {
        const itemCat = item.dataset.cat;
        const isMore = item.classList.contains('vault-more');
        const show = selected === 'all' || itemCat === selected || isMore;

        item.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        item.style.opacity = '0';
        item.style.transform = 'scale(0.95)';

        setTimeout(() => {
          item.style.display = show ? 'flex' : 'none';
          if (show) {
            requestAnimationFrame(() => {
              item.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
              item.style.opacity = '1';
              item.style.transform = 'scale(1)';
            });
          }
        }, 200);
      });
    });
  });

  // === VAULT ITEMS STAGGERED REVEAL ===

  const vaultObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const items = entry.target.querySelectorAll('.vault-item');
        items.forEach((item, i) => {
          setTimeout(() => {
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
          }, i * 60);
        });
        vaultObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  const vaultGrid = document.querySelector('.vault-grid');
  if (vaultGrid) {
    vaultGrid.querySelectorAll('.vault-item').forEach(item => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(12px)';
      item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    });
    vaultObserver.observe(vaultGrid);
  }

  // === COUNTER ANIMATION ===
  const counters = document.querySelectorAll('.stat-num');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(counter => counterObserver.observe(counter));

  function animateCounter(el) {
    const text = el.textContent;
    const num = parseFloat(text.replace(/[^0-9.]/g, ''));
    const suffix = text.replace(/[0-9.]/g, '');
    if (isNaN(num) || num === 0) return;

    const duration = 1200;
    const start = performance.now();

    const update = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = num * eased;

      if (Number.isInteger(num)) {
        el.textContent = Math.round(current) + suffix;
      } else {
        el.textContent = current.toFixed(1) + suffix;
      }

      if (progress < 1) requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  // === SMOOTH ANCHOR SCROLL ===
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  // === DASHBOARD CHART BARS ANIMATION ===
  const dashObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const bars = entry.target.querySelectorAll('.bar');
        bars.forEach((bar, i) => {
          bar.style.opacity = '0';
          bar.style.height = '0';
          setTimeout(() => {
            bar.style.transition = 'height 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease';
            bar.style.height = bar.style.getPropertyValue('--h') || bar.getAttribute('style').match(/--h:([\d%]+)/)?.[1] || '50%';
            bar.style.opacity = '1';
          }, i * 100);
        });
        dashObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  const dashCard = document.getElementById('dashboard-card');
  if (dashCard) dashObserver.observe(dashCard);

  // === PRICING CARD PARALLAX SUBTLE ===
  const pricingCard = document.getElementById('pricing-card');
  if (pricingCard) {
    window.addEventListener('mousemove', (e) => {
      const rect = pricingCard.getBoundingClientRect();
      const isNear = (
        e.clientX > rect.left - 200 && e.clientX < rect.right + 200 &&
        e.clientY > rect.top - 200 && e.clientY < rect.bottom + 200
      );
      if (!isNear) return;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);

      pricingCard.style.transform = `perspective(1000px) rotateY(${dx * 2}deg) rotateX(${-dy * 2}deg)`;
    });

    pricingCard.addEventListener('mouseleave', () => {
      pricingCard.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg)';
      pricingCard.style.transition = 'transform 0.5s ease';
    });
  }

  // === SYSTEM CARD HOVER GLOW ===
  document.querySelectorAll('.system-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mouse-x', `${x}%`);
      card.style.setProperty('--mouse-y', `${y}%`);
    });
  });

  // === TESTIMONIAL CARDS HOVER ===
  document.querySelectorAll('.testi-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'rgba(255,107,0,0.25)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '';
    });
  });

  // === SECTION ANIMATIONS WITH STAGGER ===
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const children = entry.target.querySelectorAll('.system-card, .testi-card, .step-card');
        children.forEach((child, i) => {
          child.style.opacity = '0';
          child.style.transform = 'translateY(24px)';
          setTimeout(() => {
            child.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            child.style.opacity = '1';
            child.style.transform = 'translateY(0)';
          }, i * 120);
        });
        sectionObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });

  document.querySelectorAll('.systems-grid, .testimonials-grid, .steps-timeline').forEach(el => {
    sectionObserver.observe(el);
  });

  // === PAIN ITEMS STAGGER ===
  const painObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const items = entry.target.querySelectorAll('.pain-item');
        items.forEach((item, i) => {
          item.style.opacity = '0';
          item.style.transform = 'translateX(-12px)';
          setTimeout(() => {
            item.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateX(0)';
          }, i * 100);
        });
        painObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.pain-col').forEach(el => painObserver.observe(el));

  // === VALUE TABLE ROWS STAGGER ===
  const valueObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const rows = entry.target.querySelectorAll('.vt-row, .vt-total-row, .vt-today-row');
        rows.forEach((row, i) => {
          row.style.opacity = '0';
          setTimeout(() => {
            row.style.transition = 'opacity 0.4s ease';
            row.style.opacity = '1';
          }, i * 80);
        });
        valueObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  const valueTable = document.querySelector('.value-table');
  if (valueTable) valueObserver.observe(valueTable);

  // === CURSOR GLOW EFFECT ON HERO ===
  const hero = document.getElementById('hero');
  if (hero) {
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      hero.style.setProperty('--cursor-x', `${x}px`);
      hero.style.setProperty('--cursor-y', `${y}px`);
    });
  }

  // === LOGOS BELT PAUSE ON HOVER ===
  const logosSlide = document.querySelector('.logos-slide');
  if (logosSlide) {
    const belt = logosSlide.closest('.logos-track');
    belt.addEventListener('mouseenter', () => {
      logosSlide.style.animationPlayState = 'paused';
    });
    belt.addEventListener('mouseleave', () => {
      logosSlide.style.animationPlayState = 'running';
    });
  }

  // === FLOATING PARTICLES (subtle bg effect) ===
  createParticles();

  function createParticles() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.4;';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let W, H, particles = [];

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.3,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.4 + 0.1,
        orange: Math.random() > 0.7
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > W) p.dx *= -1;
        if (p.y < 0 || p.y > H) p.dy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.orange
          ? `rgba(255,107,0,${p.alpha})`
          : `rgba(255,255,255,${p.alpha * 0.3})`;
        ctx.fill();
      });
      requestAnimationFrame(animate);
    };
    animate();
  }

  // === ACTIVE NAV LINK ON SCROLL ===
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');

  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(link => link.classList.remove('active'));
        const active = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { threshold: 0.3 });

  sections.forEach(s => navObserver.observe(s));

  // === TYPING EFFECT ON HERO HEADLINE ===
  // Already animated via CSS, but add shimmer to highlight
  const highlights = document.querySelectorAll('.highlight');
  highlights.forEach(h => {
    h.style.backgroundSize = '200% auto';
    h.style.animation = 'shimmer 3s linear infinite';
  });

  // Inject shimmer keyframe
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shimmer {
      0% { background-position: 0% center; }
      100% { background-position: 200% center; }
    }
    .nav-links a.active { color: var(--white) !important; }
    .highlight {
      background-image: linear-gradient(90deg, #FF6B00, #FF8C38, #FF5200, #FF6B00);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmer 4s linear infinite;
    }
  `;
  document.head.appendChild(style);

  // === CALCULATOR LOGIC ===
  const calcClients = document.getElementById('calc-clients');
  const calcTicket = document.getElementById('calc-ticket');
  const resMonthly = document.getElementById('res-monthly');
  const resAnnual = document.getElementById('res-annual');

  function updateCalculator() {
    if (!calcClients || !calcTicket) return;
    const clients = parseInt(calcClients.value) || 0;
    const ticket = parseFloat(calcTicket.value) || 0;
    const monthly = clients * ticket;
    const annual = monthly * 12;

    resMonthly.textContent = `R$ ${monthly.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    resAnnual.textContent = `R$ ${annual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    
    if (window.NexusTracker) {
      // Debounce tracking
      clearTimeout(window._calcTimeout);
      window._calcTimeout = setTimeout(() => {
        window.NexusTracker.track('CalculatorUse', { clients, ticket, monthly_revenue: monthly });
      }, 1000);
    }
  }

  if (calcClients) calcClients.addEventListener('input', updateCalculator);
  if (calcTicket) calcTicket.addEventListener('input', updateCalculator);

  // === LEAD MAGNET FORM ===
  const leadForm = document.getElementById('lead-form');
  if (leadForm) {
    leadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('lm-submit');
      const name = document.getElementById('lm-name').value;
      const email = document.getElementById('lm-email').value;
      const whatsapp = document.getElementById('lm-whatsapp').value;
      
      btn.innerHTML = 'Enviando...';
      btn.style.pointerEvents = 'none';

      const leadData = { name, email, phone: whatsapp };
      
      if (window.NexusTracker) {
        await window.NexusTracker.track('Lead', { lead_source: 'LeadMagnet' });
        await window.NexusTracker.enrichForLookalike(leadData);
      }

      leadForm.style.display = 'none';
      document.getElementById('lm-success-msg').style.display = 'block';
    });
  }

  // === EXIT INTENT MODAL ===
  const exitModal = document.getElementById('exit-modal');
  let exitFired = false;
  
  if (exitModal) {
    document.addEventListener('mouseleave', (e) => {
      if (e.clientY < 0 && !exitFired && !sessionStorage.getItem('nexus_exit_shown')) {
        exitFired = true;
        sessionStorage.setItem('nexus_exit_shown', 'true');
        exitModal.style.display = 'flex';
        setTimeout(() => exitModal.classList.add('active'), 10);
        if (window.NexusTracker) window.NexusTracker.track('ExitIntentShown');
      }
    });

    document.getElementById('exit-modal-close').addEventListener('click', () => {
      exitModal.classList.remove('active');
      setTimeout(() => exitModal.style.display = 'none', 300);
    });

    const exitForm = document.getElementById('exit-form');
    if (exitForm) {
      exitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = exitForm.querySelector('button');
        const name = document.getElementById('exit-name').value;
        const email = document.getElementById('exit-email').value;
        const whatsapp = document.getElementById('exit-whatsapp').value;
        
        btn.innerHTML = 'Enviando...';
        btn.style.pointerEvents = 'none';

        const leadData = { name, email, phone: whatsapp };
        if (window.NexusTracker) {
          await window.NexusTracker.track('Lead', { lead_source: 'ExitIntent' });
          await window.NexusTracker.enrichForLookalike(leadData);
        }

        exitForm.style.display = 'none';
        document.getElementById('exit-success').style.display = 'block';
        setTimeout(() => {
          exitModal.classList.remove('active');
          setTimeout(() => exitModal.style.display = 'none', 300);
        }, 3000);
      });
    }
  }

  // === MINI QUIZ MODAL ===
  const quizModal = document.getElementById('quiz-modal');
  let quizAnswers = [];
  let quizScore = 0;
  
  if (quizModal) {
    // Show quiz 30 seconds after page load if no exit intent triggered
    setTimeout(() => {
      if (!exitFired && !sessionStorage.getItem('nexus_quiz_shown')) {
        sessionStorage.setItem('nexus_quiz_shown', 'true');
        quizModal.style.display = 'flex';
        setTimeout(() => quizModal.classList.add('active'), 10);
        if (window.NexusTracker) window.NexusTracker.track('QuizShown');
      }
    }, 30000);

    document.getElementById('quiz-modal-close').addEventListener('click', () => {
      quizModal.classList.remove('active');
      setTimeout(() => quizModal.style.display = 'none', 300);
    });

    const quizBtns = document.querySelectorAll('.quiz-btn');
    quizBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const answer = btn.getAttribute('data-answer');
        const score = parseInt(btn.getAttribute('data-score') || '0');
        quizAnswers.push(answer);
        quizScore += score;
        
        const currentStep = btn.closest('.quiz-step');
        const nextStepId = parseInt(currentStep.id.split('-')[2]) + 1;
        const nextStep = document.getElementById(`quiz-step-${nextStepId}`);
        
        currentStep.style.display = 'none';
        
        if (nextStep) {
          nextStep.style.display = 'block';
          if (nextStepId === 5) {
            // Final step simulation
            setTimeout(() => {
              document.querySelector('.quiz-loader').style.display = 'none';
              document.querySelector('.quiz-result-area').style.display = 'block';
              
              // Ajusta o texto dinâmico dependendo da pontuação acumulada do Quiz
              const resultText = document.getElementById('quiz-dynamic-text');
              if (quizScore >= 40) {
                resultText.innerHTML = 'Você tem o perfil de <strong>Alto Potencial</strong>! O NexusSaaS é o acelerador exato que você precisa agora.';
              } else {
                resultText.innerHTML = 'Com base no seu perfil, o NexusSaaS é o sistema mais seguro para você começar sem dor de cabeça técnica.';
              }

              if (window.NexusTracker) {
                window.NexusTracker.track('QuizComplete', { quiz_score: quizScore });
              }
            }, 2000);
          }
        }
      });
    });

    // Lógica do Form do Quiz (Step 5)
    const quizForm = document.getElementById('quiz-form');
    if (quizForm) {
      quizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = quizForm.querySelector('button');
        const email = document.getElementById('quiz-email').value;
        const whatsapp = document.getElementById('quiz-whatsapp').value;
        
        btn.innerHTML = 'Liberando...';
        btn.style.pointerEvents = 'none';

        // Add quiz points to main score
        if (window.NexusScore) {
           window.NexusScore.score += quizScore;
           window.NexusScore.checkHighIntent();
        }

        const leadData = { email, phone: whatsapp, quizAnswers };
        if (window.NexusTracker) {
          await window.NexusTracker.track('Lead', { lead_source: 'Quiz' });
          await window.NexusTracker.enrichForLookalike(leadData);
        }

        // Redirect to checkout
        if (window.NexusTracker && window.NexusTracker.config.CHECKOUT_URL) {
          window.location.href = window.NexusTracker.config.CHECKOUT_URL;
        }
      });
    }
  }

  // === A/B TEST INIT ===
  if (window.NexusABTest) {
    // Example: Teste de Headline no Hero
    const headlineVariant = window.NexusABTest.define('hero_headline', ['variant_a', 'variant_b'], [50, 50]);
    if (headlineVariant === 'variant_b') {
      const h1 = document.querySelector('.hero-headline');
      if (h1) h1.innerHTML = 'O Atalho Definitivo Para<br /><span class="highlight">O Seu Próximo SaaS.</span>';
    }
  }

  console.log('%c NexusSaaS 🚀 ', 'background:#FF6B00;color:#fff;font-size:16px;font-weight:bold;padding:8px 16px;border-radius:8px;');
});
