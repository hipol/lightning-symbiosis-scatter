from lightning import Lightning
from numpy import random

lgn = Lightning()

x = random.randn(100)
y = random.randn(100)
group = (random.rand(100) * 5).astype('int')
size = random.rand(100) * 20 + 5

lgn.scatter(x, y, group=group, size=size)