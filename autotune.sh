for i in `seq 7 2 25`; do
	cp out.txt out.txt.$i
	echo snzip $i
	TIME=`TIMEFORMAT="%R" time snzip -t snzip -B $i -k out.txt.$i`
	SIZE=`ls -nl out.txt.$i.snz | awk '{print $5}'`
	rm out.txt.$i
	DTIME=`TIMEFORMAT="%R" time snzip -t snzip -d out.txt.$i.snz`
	echo $i $SIZE $TIME $DTIME
	rm out.txt.$i
done;

echo "===================="

for i in `seq 6 2 25`; do
	cp out.txt out.txt.$i
	echo snappy-java $i
	TIME=`TIMEFORMAT="%R" time snzip -t snappy-java -B $i -k out.txt.$i`
	SIZE=`ls -nl out.txt.$i.snappy | awk '{print $5}'`
	rm out.txt.$i
	DTIME=`TIMEFORMAT="%R" time snzip -t snappy-java -d out.txt.$i.snappy`
	echo $i $SIZE $TIME $DTIME
	rm out.txt.$i
done;

echo "==================="

for COMPRESSION in `seq 1 1 2`; do
echo "~~~~~~~~~~ -$COMPRESSION ~~~~"
for i in `seq 32 16 256`; do
        cp out.txt out.txt.$i
        echo pigz $i
        TIME=`TIMEFORMAT="%R" time pigz -$COMPRESSION -p 6 -b $i -c out.txt.$i > out.txt.pigz.$i.gz`
        SIZE=`ls -nl out.txt.pigz.$i.gz | awk '{print $5}'`
        rm out.txt.$i
        DTIME=`TIMEFORMAT="%R" time gunzip -d out.txt.pigz.$i.gz`
        echo $i $SIZE $TIME $DTIME
        rm out.txt.pigz.$i
done;
done;
