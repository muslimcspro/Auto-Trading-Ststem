# Oracle Always Free Deploy

Use one Always Free VM as a small production server for this app.

## Oracle Console

Create an Always Free Compute VM:

- Shape: `VM.Standard.A1.Flex`
- CPU/RAM: `1 OCPU` and `6 GB RAM` is enough to start
- Image: Ubuntu 24.04 or Ubuntu 22.04
- Boot volume: 50 GB
- Save the private SSH key

Open inbound ports in the VM subnet security list:

- TCP `22`
- TCP `80`
- TCP `443`

## DNS

Create an `A` record pointing your domain/subdomain to the Oracle public IP:

- Name: `trade` or `@`
- Value: Oracle VM public IP
- Proxy: DNS only if using Cloudflare during first SSL setup

## Server Setup

SSH into the VM:

```bash
ssh ubuntu@YOUR_ORACLE_PUBLIC_IP
```

Install the base tools:

```bash
git clone https://github.com/muslimcspro/Auto-Trading-Ststem.git
cd Auto-Trading-Ststem
bash scripts/oracle-setup.sh
```

Log out and SSH back in, then configure env:

```bash
cd Auto-Trading-Ststem
cp oracle.env.example .env
nano .env
```

Deploy:

```bash
bash scripts/oracle-deploy.sh
```

Useful commands:

```bash
docker compose -f docker-compose.oracle.yml logs -f app
docker compose -f docker-compose.oracle.yml logs -f caddy
docker compose -f docker-compose.oracle.yml restart app
```
