#!/usr/bin/env python3
from setuptools import setup, find_packages

setup(
    name="copper-viewer",
    version="2.0.0",
    packages=find_packages(),
    include_package_data=True,
    package_data={
        "copper_viewer": [
            "templates/*",
            "templates/vendor/*",
            "samples/*"
        ]
    },
    entry_points={
        "console_scripts": [
            "copper-viewer = copper_viewer.cli:main",
        ],
    },
)
