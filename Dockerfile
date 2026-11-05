FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev \
    && docker-php-ext-install pdo_pgsql pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY php-api/config/ /var/www/html/config/
COPY php-api/public/ /var/www/html/
COPY frontend/ /var/www/html/

ENV UPLOAD_DIR=/tmp/hostelcare-uploads