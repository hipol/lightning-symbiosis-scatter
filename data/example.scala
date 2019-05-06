import org.viz.lightning._
import scala.util.Random

val lgn = Lightning()

val x = Array.fill(100)(Random.nextFloat())
val y = Array.fill(100)(Random.nextFloat())
val group = Array.fill(100)(Random.nextFloat() * 5).map(_.toInt)
val size = Array.fill(100)(Random.nextFloat() * 20 + 5)

lgn.scatter(x, y, group=group, size=size)
