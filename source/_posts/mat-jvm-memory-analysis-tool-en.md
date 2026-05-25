---
title: Mastering JVM Heap Memory Analysis with MAT Tool
date: 2026-05-25 15:00:00
lang: en
en_permalink: en/2026/05/25/mat-jvm-memory-analysis-tool/
categories:
  - Java
  - Performance Optimization
  - JVM
tags:
  - JVM
  - Memory Analysis
  - MAT
  - Performance Tuning
---

# Mastering JVM Heap Memory Analysis with MAT Tool

## Introduction

During Java application development and operations, memory leaks and out-of-memory issues are common performance bottlenecks. To quickly identify these issues, we need professional memory analysis tools. MAT (Memory Analyzer Tool) serves as an excellent open-source tool for Java heap memory analysis, helping developers efficiently identify memory leaks, analyze memory usage, and optimize performance.

## Overview of MAT Tool

MAT (Memory Analyzer Tool) is a free tool provided by the Eclipse Foundation, specifically designed for analyzing Java heap dump files. It can quickly locate memory leaks, analyze memory usage, and provide detailed memory views.

### Main Features
- Fast analysis of large heap dumps (supports files of several GB)
- Automatic detection of memory leak suspects
- Multiple views to display memory usage
- Rich query language OQL (Object Query Language)

### Advantages
- Fast analysis speed
- High accuracy in detection
- User-friendly interface with intuitive operations
- Rich plugins with strong extensibility

## MAT Installation and Configuration

### Download and Installation
1. Visit the Eclipse MAT official website to download the latest version
2. MAT provides standalone packages and Eclipse plugin forms
3. Recommended to use standalone packages without installing Eclipse

### System Requirements
- Java Runtime Environment 8 or higher
- Recommended memory: Allocate at least 1.5 times heap memory to MAT
- 64-bit operating system (recommended for processing large heap dumps)

### Basic Configuration
When launching MAT, you can adjust JVM parameters by modifying the mat.ini file:
```
-Xmx8g        # Set maximum heap memory
-XX:+UseG1GC  # Use G1 garbage collector
```

## Creating Heap Dump Files

### Trigger Conditions
- Application throws OutOfMemoryError
- Manual triggering of heap dumps
- Regular automatic creation of heap dumps

### Generation Methods

#### 1. Auto-generation via JVM Parameters
```bash
java -XX:+HeapDumpOnOutOfMemoryError \
     -XX:HeapDumpPath=/path/to/dumps/ \
     -jar your-application.jar
```

#### 2. Using jmap Command Manually
```bash
# Get Java process ID
jps -l

# Create heap dump file
jmap -dump:format=b,file=heap.hprof <pid>

# Heap dump with GC roots path
jmap -dump:live,format=b,file=heap.hprof <pid>
```

#### 3. Using jcmd Command
```bash
# List all Java processes
jcmd

# Create heap dump
jcmd <pid> GC.run_finalization
jcmd <pid> VM.class_hierarchy
jcmd <pid> GC.dump /path/to/heap.hprof
```

## MAT Core Views Explained

### 1. Histogram
Displays the number of instances and memory usage for each class, quickly identifying objects that consume large amounts of memory.

**Interpretation Points:**
- Class Name: Shows the full class name
- Objects: Number of instances of the class
- Shallow Heap: Memory occupied by the object itself
- Retained Heap: Total memory occupied by the object and its associated objects

### 2. Dominator Tree
Shows reference relationships between objects and identifies which objects occupy the most retained memory.

**Features:**
- Shows complete object reference chains
- Sorted by Retained Heap
- Directly locates memory leak origins

### 3. Leak Suspects
MAT's intelligent analysis feature that automatically identifies the most likely memory leak points.

### 4. Thread Overview
Analyzes thread-related information, including thread stacks, local variables, etc.

### 5. Biggest Objects by Size
Displays the largest objects by memory usage, facilitating quick identification of large object issues.

## MAT Usage in Detail

### 1. Opening Heap Dump Files
1. Launch MAT
2. Select "Open a Heap Dump"
3. Choose the hprof file
4. Wait for analysis completion (creates indexes to improve query speed)

### 2. Memory Leak Detection
- View Leak Suspects report
- Look for unusually large objects in Dominator Tree
- Use Path To GC Roots function to analyze object retention reasons

### 3. Path to GC Roots Analysis
Right-click suspicious object → Path To GC Roots → Exclude weak/soft/phantom references

This analysis method identifies all reference paths preventing object collection.

### 4. Query Language (OQL) Usage
MAT provides SQL-like query language OQL:

```sql
-- Find instances of specific class
SELECT * FROM com.example.MyClass

-- Filter by size
SELECT * FROM java.lang.String WHERE toString().length() > 100

-- Count specific class instances
SELECT COUNT(*) FROM com.example.MyClass
```

## Practical Heap Dump Problem Diagnosis

### Scenario 1: Locating Memory Leaks

#### Step 1: Use Leak Suspects Report
After opening the heap dump, MAT automatically generates a Leak Suspects report containing:
- Summary information about suspicious leak points
- Possible cause analysis
- Reference chains of related objects

#### Step 2: Analyze Dominator Tree
1. Sort by Retained Heap
2. Look for objects consuming unusually large memory
3. Expand objects to view their references

#### Step 3: Verify Assumptions
1. Use Path To GC Roots to analyze why objects aren't collected
2. Review related business logic code
3. Confirm if references are not properly released

### Scenario 2: Analyzing Large Objects

#### Step 1: Use Histogram for Finding
1. Sort by Shallow Heap
2. Find objects consuming large amounts of memory
3. Analyze the reason for object creation

#### Step 2: Track Object Origins
1. Use Merge Shortest Paths to GC Roots
2. Find the code path that created these large objects
3. Evaluate optimization opportunities

### Scenario 3: Collection Class Analysis

#### Step 1: Locate Large Collections
1. Find Collection classes (HashMap, ArrayList) in Histogram
2. Check their instance sizes and numbers

#### Step 2: Analyze Collection Contents
1. Use List Objects to view elements in collections
2. Analyze collection growth trends
3. Check if appropriate cleanup mechanisms exist

## Advanced Techniques and Best Practices

### 1. Optimizing MAT Performance
- Allocate sufficient memory to MAT
- Use SSD storage for temporary files
- Appropriately adjust MAT's JVM parameters

### 2. Analysis Techniques
- Check Leak Suspects report first
- Focus on Retained Heap rather than Shallow Heap
- Use comparison analysis to compare heap dumps at different time points

### 3. Memory Leak Prevention
- Avoid storing large objects in static collections
- Close resources promptly (InputStream, Connection, etc.)
- Use WeakReference for caching

## Common Memory Problem Patterns

### 1. Collection Leaks
- HashMap, ArrayList, etc. not cleaned up in time
- Cache without expiration policies

### 2. Listener Leaks
- Registered listeners not unregistered
- Anonymous inner classes holding outer class references

### 3. Static Variable Leaks
- Static variables holding references to large objects
- Growing static collections

## Conclusion

MAT is an essential memory analysis tool for Java developers, and mastering its usage is crucial for performance tuning. By making reasonable use of MAT's various features, we can quickly locate memory leaks, optimize memory usage, and thereby enhance application stability and performance.

Remember that memory analysis is not only a technical issue but also a deep understanding process of application architecture and business logic. Developing good programming habits in daily development and preventing memory issues at the source is the fundamental approach.