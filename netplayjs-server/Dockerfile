FROM node:18

ADD ./src /app/src

ADD package.json /app/
ADD package-lock.json /app/
ADD tsconfig.json /app/

WORKDIR /app

RUN npm install

CMD npm start