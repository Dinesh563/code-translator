import os
from typing import List

VERSION = "1.0"

def add(a, b):
    return a + b

class Calculator:
    def __init__(self):
        self.total = 0

    def add(self, n):
        self.total += n
        return self
