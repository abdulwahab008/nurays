# FrozenNuray Platform - Deployment Guide

## Document Information
- **Version**: 1.0
- **Last Updated**: November 2025
- **Document Owner**: DevOps Team
- **Target Audience**: DevOps Engineers, System Administrators

---

## 1. Deployment Overview

### 1.1 Deployment Environments

**Development:**
- Purpose: Local development
- Infrastructure: Developer machines
- Database: Local PostgreSQL
- Services: Mocked external services

**Staging:**
- Purpose: Pre-production testing
- Infrastructure: AWS/DigitalOcean (smaller instances)
- Database: Staging database (anonymized data)
- Services: Test mode external services

**Production:**
- Purpose: Live application
- Infrastructure: AWS/DigitalOcean (scaled instances)
- Database: Production database
- Services: Production external services

### 1.2 Deployment Strategy

**Backend:**
- Blue-green deployment
- Zero-downtime deployments
- Automated rollback on failure
- Health checks before traffic switch

**Frontend (Web):**
- Vercel deployment (recommended)
- Or: AWS S3 + CloudFront
- Automatic deployments on merge to main

**Mobile Apps:**
- Android: Google Play Store
- iOS: App Store
- Staged rollouts (10% → 50% → 100%)

---

## 2. Prerequisites

### 2.1 Required Accounts

- AWS Account (or DigitalOcean)
- Domain registrar account
- Cloudflare account (CDN + DNS)
- GitHub account (CI/CD)
- Vercel account (web deployment)
- Google Play Console (Android)
- Apple App Store Connect (iOS)

### 2.2 Required Tools

- Docker & Docker Compose
- AWS CLI (or DigitalOcean CLI)
- kubectl (if using Kubernetes)
- Terraform (infrastructure as code)
- GitHub Actions (CI/CD)

### 2.3 Required Knowledge

- Linux server administration
- Docker containerization
- Cloud infrastructure (AWS/DigitalOcean)
- CI/CD pipelines
- SSL/TLS certificates
- Domain management

---

## 3. Infrastructure Setup

### 3.1 AWS Setup (Recommended)

**Services Used:**
- EC2: Application servers
- RDS: PostgreSQL database
- ElastiCache: Redis cache
- S3: File storage and backups
- CloudFront: CDN
- Route 53: DNS
- ACM: SSL certificates
- CloudWatch: Monitoring

**Region:** Bahrain (me-south-1) - Lowest latency for Pakistan

**Initial Setup:**
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure
# Enter: Access Key ID, Secret Access Key, Region (me-south-1), Output format (json)
```

### 3.2 DigitalOcean Setup (Alternative)

**Services Used:**
- Droplets: Application servers
- Managed Databases: PostgreSQL
- Spaces: Object storage
- Load Balancer: Traffic distribution
- DNS: Domain management

**Initial Setup:**
```bash
# Install doctl
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.94.0/doctl-1.94.0-linux-amd64.tar.gz
tar xf doctl-1.94.0-linux-amd64.tar.gz
sudo mv doctl /usr/local/bin

# Authenticate
doctl auth init
```

---

## 4. Backend Deployment

### 4.1 Server Setup

**EC2 Instance (AWS):**
- Instance Type: t3.medium (2 vCPU, 4GB RAM) - Start
- OS: Ubuntu 22.04 LTS
- Storage: 20GB SSD
- Security Group: Allow HTTPS (443), SSH (22 from whitelisted IPs)

**Droplet (DigitalOcean):**
- Size: 4GB RAM, 2 vCPU
- OS: Ubuntu 22.04 LTS
- Region: Singapore (closest to Pakistan)

**Server Hardening:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create non-root user
sudo adduser deploy
sudo usermod -aG docker deploy
sudo usermod -aG sudo deploy
```

### 4.2 Application Deployment

**Directory Structure:**
```
/home/deploy/frozen-nuray/
├── backend/
├── docker-compose.yml
├── .env
└── nginx/
```

**Docker Compose Configuration:**
```yaml
version: '3.8'

services:
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - api
    restart: unless-stopped
```

**Deployment Script:**
```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 Starting deployment..."

# Pull latest code
git pull origin main

# Build and start containers
docker-compose build
docker-compose up -d

# Run database migrations
docker-compose exec api npx prisma migrate deploy

# Wait for health check
sleep 10
curl -f http://localhost:3000/health || exit 1

echo "✅ Deployment complete!"
```

### 4.3 Environment Variables

**.env File (Production):**
```bash
# Database
DATABASE_URL=postgresql://user:password@rds-endpoint:5432/frozennuray

# Redis
REDIS_URL=redis://elasticache-endpoint:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h

# Payment Gateways
JAZZCASH_MERCHANT_ID=your-merchant-id
JAZZCASH_PASSWORD=your-password
EASYPAISA_STORE_ID=your-store-id
STRIPE_SECRET_KEY=sk_live_...

# SMS
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890

# Email
SENDGRID_API_KEY=your-sendgrid-key

# File Storage
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Maps
GOOGLE_MAPS_API_KEY=your-google-maps-key

# App
NODE_ENV=production
PORT=3000
API_URL=https://api.frozennuray.com
```

**Security:**
- Store .env file securely (not in git)
- Use AWS Secrets Manager or HashiCorp Vault
- Rotate secrets regularly
- Use different secrets for each environment

---

## 5. Database Deployment

### 5.1 RDS Setup (AWS)

**Database Configuration:**
- Engine: PostgreSQL 15.x
- Instance: db.t3.medium (2 vCPU, 4GB RAM)
- Storage: 100GB (auto-scaling enabled)
- Multi-AZ: Enabled (for high availability)
- Backup: Daily automated backups (7-day retention)
- Encryption: Enabled at rest

**Connection:**
```bash
# Get endpoint
aws rds describe-db-instances --db-instance-identifier frozennuray-db

# Connect
psql -h <endpoint> -U admin -d frozennuray
```

### 5.2 Database Migrations

**Migration Strategy:**
```bash
# Development
npx prisma migrate dev

# Staging/Production
npx prisma migrate deploy
```

**Migration Best Practices:**
- Test migrations on staging first
- Backup database before migration
- Run migrations during low-traffic hours
- Have rollback plan ready

### 5.3 Database Backups

**Automated Backups:**
- RDS: Automatic daily backups
- Manual: Before major changes
- Retention: 30 days

**Backup Restoration:**
```bash
# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier frozennuray-db-restored \
  --db-snapshot-identifier snapshot-name
```

---

## 6. Frontend Deployment (Web)

### 6.1 Vercel Deployment (Recommended)

**Setup:**
1. Connect GitHub repository to Vercel
2. Configure build settings:
   - Framework: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
3. Add environment variables
4. Deploy

**Environment Variables:**
```bash
NEXT_PUBLIC_API_URL=https://api.frozennuray.com
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your-key
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
```

**Automatic Deployments:**
- Production: Deploys on merge to `main` branch
- Preview: Deploys on every PR

### 6.2 AWS S3 + CloudFront (Alternative)

**Setup:**
```bash
# Build
cd frontend-web
npm run build

# Upload to S3
aws s3 sync .next/static s3://frozennuray-web/static
aws s3 sync public s3://frozennuray-web/public

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

---

## 7. Mobile App Deployment

### 7.1 Android Deployment

**Build:**
```bash
cd mobile-app
flutter build appbundle --release
```

**Google Play Console:**
1. Create app listing
2. Upload app bundle
3. Fill store listing details
4. Submit for review
5. Staged rollout (10% → 50% → 100%)

### 7.2 iOS Deployment

**Build:**
```bash
cd mobile-app
flutter build ios --release
```

**App Store Connect:**
1. Create app record
2. Upload build via Xcode or Transporter
3. Fill app information
4. Submit for review
5. Release after approval

---

## 8. CI/CD Pipeline

### 8.1 GitHub Actions Workflow

**.github/workflows/deploy.yml:**
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: npm run test:coverage

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: |
          docker build -t frozennuray-api:${{ github.sha }} ./backend
          docker tag frozennuray-api:${{ github.sha }} frozennuray-api:latest

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to staging
        run: |
          ssh deploy@staging-server "cd /home/deploy/frozen-nuray && git pull && docker-compose up -d"

  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          ssh deploy@production-server "cd /home/deploy/frozen-nuray && git pull && docker-compose up -d"
```

### 8.2 Deployment Process

**Automated:**
1. Code pushed to `main` branch
2. Tests run automatically
3. Build Docker image
4. Deploy to staging
5. Run smoke tests
6. Deploy to production (if staging passes)

**Manual Approval:**
- Production deployments require manual approval
- Review staging deployment first
- Check monitoring before production deploy

---

## 9. SSL/TLS Setup

### 9.1 Let's Encrypt (Free)

**Install Certbot:**
```bash
sudo apt install certbot python3-certbot-nginx
```

**Obtain Certificate:**
```bash
sudo certbot --nginx -d api.frozennuray.com
```

**Auto-Renewal:**
```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab (auto-renewal)
0 0 * * * certbot renew --quiet
```

### 9.2 AWS Certificate Manager (ACM)

**Request Certificate:**
1. Go to ACM in AWS Console
2. Request public certificate
3. Add domain names (api.frozennuray.com, *.frozennuray.com)
4. Validate via DNS
5. Use with CloudFront or ALB

---

## 10. Monitoring and Logging

### 10.1 Application Monitoring

**Sentry (Error Tracking):**
```bash
# Install Sentry
npm install @sentry/node

# Configure
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

**LogRocket (Session Replay):**
- Sign up at logrocket.com
- Add SDK to frontend
- Monitor user sessions

### 10.2 Infrastructure Monitoring

**CloudWatch (AWS):**
- CPU utilization
- Memory usage
- Disk I/O
- Network traffic
- Custom metrics

**Uptime Monitoring:**
- Pingdom or UptimeRobot
- Monitor API endpoints
- Alert on downtime

### 10.3 Logging

**Application Logs:**
```typescript
// Structured logging
logger.info('Order created', {
  orderId: order.id,
  customerId: customer.id,
  amount: order.total_amount,
});
```

**Log Aggregation:**
- CloudWatch Logs (AWS)
- Or: ELK Stack (Elasticsearch, Logstash, Kibana)

---

## 11. Backup and Recovery

### 11.1 Database Backups

**Automated:**
- RDS: Daily automated backups
- Retention: 30 days
- Point-in-time recovery: Enabled

**Manual Backup:**
```bash
# Create backup
pg_dump -h <host> -U <user> -d frozennuray > backup.sql

# Restore
psql -h <host> -U <user> -d frozennuray < backup.sql
```

### 11.2 File Backups

**Cloudinary:**
- Automatic backups enabled
- Manual backup to S3 (weekly)

**Application Files:**
- Configuration files in git
- Environment variables in secrets manager

---

## 12. Security Hardening

### 12.1 Server Security

**Firewall:**
```bash
# UFW configuration
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp  # SSH (restrict to specific IPs)
sudo ufw allow 80/tcp  # HTTP
sudo ufw allow 443/tcp # HTTPS
sudo ufw enable
```

**SSH Security:**
```bash
# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Key-based authentication only
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Restart SSH
sudo systemctl restart sshd
```

### 12.2 Application Security

**Security Headers:**
- Configured in nginx
- HTTPS only
- HSTS enabled
- CSP headers

**Rate Limiting:**
- Implemented in application
- Per IP and per user
- Redis-based rate limiting

---

## 13. Scaling

### 13.1 Horizontal Scaling

**Load Balancer:**
- AWS ALB or DigitalOcean Load Balancer
- Health checks configured
- SSL termination at load balancer

**Auto-Scaling:**
- AWS Auto Scaling Groups
- Scale based on CPU/memory
- Min: 2 instances, Max: 10 instances

### 13.2 Database Scaling

**Read Replicas:**
- Create read replicas for read-heavy operations
- Application uses read replicas for queries
- Primary for writes only

**Connection Pooling:**
- PgBouncer for connection pooling
- Reduce database connections

---

## 14. Rollback Procedure

### 14.1 Application Rollback

**Quick Rollback:**
```bash
# Revert to previous Docker image
docker-compose down
docker-compose up -d frozennuray-api:previous-tag
```

**Git Rollback:**
```bash
# Revert to previous commit
git revert HEAD
git push origin main
# Triggers new deployment
```

### 14.2 Database Rollback

**Migration Rollback:**
```bash
# Rollback last migration
npx prisma migrate resolve --rolled-back <migration-name>
```

**Data Rollback:**
- Restore from backup
- Point-in-time recovery (RDS)

---

## 15. Post-Deployment Checklist

- [ ] Health checks passing
- [ ] SSL certificates valid
- [ ] Monitoring alerts configured
- [ ] Logs being collected
- [ ] Backups running
- [ ] Performance metrics normal
- [ ] Error rates normal
- [ ] Smoke tests passing

---

## 16. Troubleshooting

### 16.1 Common Issues

**Application Not Starting:**
- Check logs: `docker-compose logs api`
- Check environment variables
- Check database connectivity
- Check Redis connectivity

**High Error Rate:**
- Check application logs
- Check database performance
- Check external service status
- Check rate limiting

**Performance Issues:**
- Check database query performance
- Check cache hit rates
- Check server resources
- Check network latency

---

## 17. Contact Information

**DevOps Team:**
- DevOps Lead: devops@frozennuray.com
- On-Call: [Emergency contact]

**Infrastructure:**
- AWS Support: [Support plan]
- DigitalOcean Support: [Support plan]

---

**End of Document**

