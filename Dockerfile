FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html blog.html help.html announcements.html staff.html dashboard.html login.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/styles.css
COPY script.js /usr/share/nginx/html/script.js
COPY assets /usr/share/nginx/html/assets
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]