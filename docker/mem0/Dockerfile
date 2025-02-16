FROM python:3.12-slim

WORKDIR /app

RUN pip config set global.index-url http://mirrors.aliyun.com/pypi/simple/ \
    && pip config set install.trusted-host mirrors.aliyun.com

COPY requirements.txt /app

RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

EXPOSE 5000

CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]
