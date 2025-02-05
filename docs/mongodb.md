# MongoDB 维护手册

## 容器内连接

可以使用这个 URI `mongodb://mongo.sili.local:27017/sili_v4`

## 备份

把备份文件写入到容器内部的 `/data/db/archives` 目录下：

```shell
docker exec -it sili-mongo mongodump --archive=/data/db/archives/$(date +%Y%m%d%H%M%S).archive
```

当然，你也可以把文件直接备份到宿主机执行命令的目录下：

```shell
docker exec -it sili-mongo mongodump --archive > mongo_dump.archive
```

## 恢复

可以把 archive 文件放在 `data/mongo/archives` 目录下，然后执行：

```shell
docker exec -i sili-mongo mongorestore --archive=/data/db/archives/xxx.archive
```

----

`data/mongo` 是容器内部的 `/data/db` 目录的映射。

总之怎么方便怎么来，只要别把数据搞丢了或者推到 git 源仓库就行。